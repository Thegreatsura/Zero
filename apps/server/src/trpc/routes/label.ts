import { activeDriverProcedure, createRateLimiterMiddleware, router } from '../trpc';
import { getZeroAgent } from '../../lib/server-utils';
import { Ratelimit } from '@upstash/ratelimit';
import { labelOrder } from '../../db/schema';
import { env } from 'cloudflare:workers';
import { eq, sql } from 'drizzle-orm';
import { createDb } from '../../db';
import { nanoid } from 'nanoid';
import { z } from 'zod';

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

      const labelOrders = await agent.getLabelOrders();

      const orderMap = new Map(
        labelOrders.map((lo) => [lo.labelId, { order: lo.order, customColor: lo.customColor }]),
      );

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

      await agent.createLabel(label);

      const allLabels = await agent.getUserLabels();
      const createdLabel = allLabels.find((l) => l.name === label.name);

      if (createdLabel?.id) {
        const { db, conn } = createDb(env.HYPERDRIVE.connectionString);
        try {
          const maxOrderResult = await db
            .select({ maxOrder: sql<number>`COALESCE(MAX("order"), -1)` })
            .from(labelOrder)
            .where(eq(labelOrder.connectionId, activeConnection.id));

          const nextOrder = (maxOrderResult[0]?.maxOrder ?? -1) + 1;

          await db
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
        } finally {
          await conn.end();
        }
      }

      return createdLabel || { name: label.name, color: labelColor, type: 'user' };
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
      const agent = await getZeroAgent(activeConnection.id);

      await agent.updateLabelOrders(input.labelOrders);
      return { success: true };
    }),
  getOrders: activeDriverProcedure.query(async ({ ctx }) => {
    const { activeConnection } = ctx;
    const agent = await getZeroAgent(activeConnection.id);
    const labelOrders = await agent.getLabelOrders();

    const ordersMap: Record<string, number> = {};
    labelOrders.forEach((lo) => {
      ordersMap[lo.labelId] = lo.order;
    });

    return Object.keys(ordersMap).length > 0 ? ordersMap : null;
  }),
});
