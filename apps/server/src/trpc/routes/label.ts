import { activeDriverProcedure, createRateLimiterMiddleware, router } from '../trpc';
import { getZeroAgent, getZeroDB } from '../../lib/server-utils';
import { Ratelimit } from '@upstash/ratelimit';
import { labelOrder } from '../../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';

// Add label colors constant
const LABEL_COLORS = [
  { textColor: '#FFFFFF', backgroundColor: '#202020' },
  { textColor: '#D1F0D9', backgroundColor: '#12341D' },
  { textColor: '#FDECCE', backgroundColor: '#413111' },
  { textColor: '#FDD9DF', backgroundColor: '#411D23' },
  { textColor: '#D8E6FD', backgroundColor: '#1C2A41' },
  { textColor: '#E8DEFD', backgroundColor: '#2C2341' },
];

export const labelsRouter = router({
  list: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        generatePrefix: ({ sessionUser }) => `ratelimit:get-labels-${sessionUser?.id}`,
        limiter: Ratelimit.slidingWindow(60, '1m'),
      }),
    )
    .output(
      z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          color: z
            .object({
              backgroundColor: z.string(),
              textColor: z.string(),
            })
            .optional(),
          type: z.string(),
          order: z.number().optional(),
        }),
      ),
    )
    .query(async ({ ctx }) => {
      const { activeConnection } = ctx;
      const agent = await getZeroAgent(activeConnection.id);
      const labels = await agent.getUserLabels();

      // Get label orders and custom colors from database
      const db = getZeroDB(ctx.activeConnection.id);
      const labelOrders = await db.getLabelOrders(ctx.activeConnection.id);

      const orderMap = new Map(
        labelOrders.map((lo) => [lo.labelId, { order: lo.order, customColor: lo.customColor }]),
      );

      // Merge labels with order and custom colors
      return labels
        .map((label) => ({
          ...label,
          order: orderMap.get(label.id)?.order ?? 999999,
          color: orderMap.get(label.id)?.customColor || label.color,
        }))
        .sort((a, b) => a.order - b.order);
    }),
  create: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        generatePrefix: ({ sessionUser }) => `ratelimit:labels-post-${sessionUser?.id}`,
        limiter: Ratelimit.slidingWindow(60, '1m'),
      }),
    )
    .input(
      z.object({
        name: z.string(),
        color: z
          .object({
            backgroundColor: z.string(),
            textColor: z.string(),
          })
          .default({
            backgroundColor: '',
            textColor: '',
          }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { activeConnection } = ctx;
      const agent = await getZeroAgent(activeConnection.id);

      // Assign random color if no color is provided
      let labelColor = input.color;
      if (!labelColor.backgroundColor || !labelColor.textColor) {
        const randomColor = LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)];
        labelColor = randomColor;
      }

      const label = {
        ...input,
        color: labelColor,
        type: 'user',
      };

      // Create the label with the provider
      const createdLabel = await agent.createLabel(label);

      // Store the custom color in our database
      if (createdLabel.id) {
        // Get the next order value
        const maxOrderResult = await ctx.db
          .select({ maxOrder: sql<number>`COALESCE(MAX("order"), -1)` })
          .from(labelOrder)
          .where(eq(labelOrder.connectionId, activeConnection.id));

        const nextOrder = (maxOrderResult[0]?.maxOrder ?? -1) + 1;

        await ctx.db
          .insert(labelOrder)
          .values({
            id: nanoid(),
            connectionId: activeConnection.id,
            labelId: createdLabel.id,
            order: nextOrder,
            customColor: labelColor,
          })
          .onConflictDoUpdate({
            target: [labelOrder.connectionId, labelOrder.labelId],
            set: {
              customColor: labelColor,
              updatedAt: new Date(),
            },
          });
      }

      return createdLabel;
    }),
  update: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        generatePrefix: ({ sessionUser }) => `ratelimit:labels-patch-${sessionUser?.id}`,
        limiter: Ratelimit.slidingWindow(60, '1m'),
      }),
    )
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string().optional(),
        color: z
          .object({
            backgroundColor: z.string(),
            textColor: z.string(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { activeConnection } = ctx;
      const agent = await getZeroAgent(activeConnection.id);
      const { id, ...label } = input;
      return await agent.updateLabel(id, label);
    }),
  delete: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        generatePrefix: ({ sessionUser }) => `ratelimit:labels-delete-${sessionUser?.id}`,
        limiter: Ratelimit.slidingWindow(60, '1m'),
      }),
    )
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { activeConnection } = ctx;
      const agent = await getZeroAgent(activeConnection.id);
      return await agent.deleteLabel(input.id);
    }),
  reorder: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        generatePrefix: ({ sessionUser }) => `ratelimit:labels-reorder-${sessionUser?.id}`,
        limiter: Ratelimit.slidingWindow(30, '1m'),
      }),
    )
    .input(
      z.object({
        labelOrders: z.array(
          z.object({
            id: z.string(),
            order: z.number(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { activeConnection } = ctx;

      // Use a transaction to update all orders atomically
      await ctx.db.transaction(async (tx) => {
        for (const { id: labelId, order } of input.labelOrders) {
          await tx
            .insert(labelOrder)
            .values({
              id: nanoid(),
              connectionId: activeConnection.id,
              labelId,
              order,
            })
            .onConflictDoUpdate({
              target: [labelOrder.connectionId, labelOrder.labelId],
              set: {
                order,
                updatedAt: new Date(),
              },
            });
        }
      });

      return { success: true };
    }),
  getOrders: activeDriverProcedure.query(async ({ ctx }) => {
    const { activeConnection } = ctx;
    const ordersStr = await env.label_orders.get(`${activeConnection.id}_label_orders`);
    return ordersStr ? JSON.parse(ordersStr) : null;
  }),
});
