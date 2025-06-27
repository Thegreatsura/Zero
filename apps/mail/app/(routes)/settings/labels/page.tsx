import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SettingsCard } from '@/components/settings/settings-card';
import { Check, Plus, Pencil, GripVertical } from 'lucide-react';
import { LabelDialog } from '@/components/labels/label-dialog';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CurvedArrow } from '@/components/icons/icons';
import { Separator } from '@/components/ui/separator';
import { useTRPC } from '@/providers/query-provider';
import { type Label as LabelType } from '@/types';
import { Button } from '@/components/ui/button';
import { HexColorPicker } from 'react-colorful';
import { Bin } from '@/components/icons/icons';
import { useLabels } from '@/hooks/use-labels';
import { GMAIL_COLORS } from '@/lib/constants';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'use-intl';
import { useForm } from 'react-hook-form';
import { useState, useMemo } from 'react';
import { CSS } from '@dnd-kit/utilities';
import { Command } from 'lucide-react';
import { COLORS } from './colors';
import { toast } from 'sonner';

interface SortableLabelItemProps {
  label: LabelType;
  onEdit: (label: LabelType) => void;
  onDelete: (id: string) => void;
}

function SortableLabelItem({ label, onEdit, onDelete }: SortableLabelItemProps) {
  const t = useTranslations();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: label.id || '',
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="hover:bg-muted/50 group relative flex items-center justify-between rounded-lg p-3 transition-colors"
    >
      <div className="flex items-center space-x-3">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none opacity-0 transition-opacity group-hover:opacity-100"
        >
          <GripVertical className="text-muted-foreground h-4 w-4" />
        </div>
        <Badge
          className="px-2 py-1"
          style={{
            backgroundColor: label.color?.backgroundColor,
            color: label.color?.textColor,
          }}
        >
          <span>{label.name}</span>
        </Badge>
      </div>
      <div className="dark:bg-panelDark absolute right-2 z-[25] flex items-center gap-1 rounded-xl border bg-white p-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 [&_svg]:size-3.5"
              onClick={() => onEdit(label)}
            >
              <Pencil className="text-[#898989]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="dark:bg-panelDark mb-1 bg-white">
            {t('common.labels.editLabel')}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-[#FDE4E9] dark:hover:bg-[#411D23] [&_svg]:size-3.5"
              onClick={() => onDelete(label.id!)}
            >
              <Bin className="fill-[#F43F5E]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="dark:bg-panelDark mb-1 bg-white">
            {t('common.labels.deleteLabel')}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export default function LabelsPage() {
  const t = useTranslations();
  const { data: labels, isLoading, error, refetch } = useLabels();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<LabelType | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const trpc = useTRPC();
  const { mutateAsync: createLabel } = useMutation(trpc.labels.create.mutationOptions());
  const { mutateAsync: updateLabel } = useMutation(trpc.labels.update.mutationOptions());
  const { mutateAsync: deleteLabel } = useMutation(trpc.labels.delete.mutationOptions());
  const { mutateAsync: updateLabelOrders } = useMutation(trpc.labels.reorder.mutationOptions());

  // Labels are already sorted from the server, no need for client-side sorting
  const sortedLabels = labels || [];

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleSubmit = async (data: LabelType) => {
    await toast.promise(
      editingLabel
        ? updateLabel({ id: editingLabel.id!, name: data.name, color: data.color })
        : createLabel({ color: data.color, name: data.name }),
      {
        loading: t('common.labels.savingLabel'),
        success: t('common.labels.saveLabelSuccess'),
        error: t('common.labels.failedToSavingLabel'),
      },
    );
  };

  const handleDelete = async (id: string) => {
    toast.promise(deleteLabel({ id }), {
      loading: t('common.labels.deletingLabel'),
      success: t('common.labels.deleteLabelSuccess'),
      error: t('common.labels.failedToDeleteLabel'),
      finally: async () => {
        await refetch();
      },
    });
  };

  const handleEdit = (label: LabelType) => {
    setEditingLabel(label);
    setIsDialogOpen(true);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortedLabels.findIndex((label) => label.id === active.id);
      const newIndex = sortedLabels.findIndex((label) => label.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newLabels = arrayMove(sortedLabels, oldIndex, newIndex);
        const newOrders = newLabels.map((label, index) => ({
          id: label.id!,
          order: index,
        }));

        await toast.promise(updateLabelOrders({ labelOrders: newOrders }), {
          loading: t('common.actions.loading'),
          success: t('common.labels.labelsReordered'),
          error: t('common.labels.failedToReorderLabels'),
        });

        // Refetch to get updated data from server
        await refetch();
      }
    }

    setActiveId(null);
  };

  const activeLabel = activeId ? sortedLabels.find((label) => label.id === activeId) : null;

  return (
    <div className="grid gap-6">
      <SettingsCard
        title={t('pages.settings.labels.title')}
        description={t('pages.settings.labels.description')}
        action={
          <LabelDialog
            trigger={
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t('common.mail.createNewLabel')}
              </Button>
            }
            editingLabel={editingLabel}
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) setEditingLabel(null);
            }}
            onSubmit={handleSubmit}
            onSuccess={refetch}
          />
        }
      >
        <div className="space-y-6">
          <Separator />
          <ScrollArea className="h-full pr-4">
            <div className="space-y-4">
              {isLoading && !error ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white dark:border-t-transparent" />
                </div>
              ) : error ? (
                <p className="text-muted-foreground py-4 text-center text-sm">{error.message}</p>
              ) : labels?.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  {t('common.mail.noLabelsAvailable')}
                </p>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={sortedLabels.map((label) => label.id || '')}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="flex flex-col space-y-2">
                      {sortedLabels.map((label) => (
                        <SortableLabelItem
                          key={label.id}
                          label={label}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  </SortableContext>
                  <DragOverlay>
                    {activeLabel && (
                      <div className="bg-background rounded-lg p-3 shadow-lg">
                        <Badge
                          className="px-2 py-1"
                          style={{
                            backgroundColor: activeLabel.color?.backgroundColor,
                            color: activeLabel.color?.textColor,
                          }}
                        >
                          <span>{activeLabel.name}</span>
                        </Badge>
                      </div>
                    )}
                  </DragOverlay>
                </DndContext>
              )}
            </div>
          </ScrollArea>
        </div>
      </SettingsCard>
    </div>
  );
}
