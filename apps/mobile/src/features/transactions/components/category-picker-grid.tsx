import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type {
  Category,
  CategoryType,
  CreateCategoryInput,
  TransactionSplit,
} from '@repo/contracts';
import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { ThemedView } from '@/common/components/themed-view';
import { useTheme } from '@/common/hooks/use-theme';

export interface CategoryPickerGridProps {
  type: CategoryType;
  pinnedCategories: readonly Category[];
  allRankedCategories: readonly Category[];
  selectedCategoryId?: string;
  splits?: readonly TransactionSplit[];
  onSelectCategory: (categoryId: string) => void;
  onOpenSplitEditor: () => void;
  onCreateCustomCategory: (input: CreateCategoryInput) => Promise<Category>;
}

type GridTileItem =
  | { kind: 'category'; category: Category }
  | { kind: 'more' };

const PRESET_ICONS = ['🏷️', '🛒', '🍔', '🚗', '🎮', '🐾', '🎁', '🛠️', '📚', '🏥'] as const;
const PRESET_COLORS = ['#1B4332', '#1E6F4E', '#2C5F6E', '#B4432C', '#A16207', '#6D4C41'] as const;

export function CategoryPickerGrid({
  type,
  pinnedCategories,
  allRankedCategories,
  selectedCategoryId,
  splits,
  onSelectCategory,
  onOpenSplitEditor,
  onCreateCustomCategory,
}: CategoryPickerGridProps) {
  const theme = useTheme();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<string>(PRESET_ICONS[0]);
  const [selectedColor, setSelectedColor] = useState<string>(PRESET_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasSplits = Boolean(splits && splits.length >= 2);
  const splitCategoryIds = useMemo(
    () => new Set(splits?.map((s) => s.categoryId) ?? []),
    [splits],
  );

  // Up to 7 pinned categories + 1 "More" tile grouped into explicit 4-column rows
  const gridRows = useMemo(() => {
    const items: GridTileItem[] = [
      ...pinnedCategories.slice(0, 7).map((category) => ({
        kind: 'category' as const,
        category,
      })),
      { kind: 'more' as const },
    ];
    const rows: (GridTileItem | null)[][] = [];
    for (let i = 0; i < items.length; i += 4) {
      const slice: (GridTileItem | null)[] = items.slice(i, i + 4);
      while (slice.length < 4) {
        slice.push(null);
      }
      rows.push(slice);
    }
    return rows;
  }, [pinnedCategories]);

  // Filtered categories for full search modal
  const filteredCategories = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) {
      return allRankedCategories;
    }
    return allRankedCategories.filter((cat) =>
      cat.name.toLowerCase().includes(trimmed),
    );
  }, [allRankedCategories, searchQuery]);

  const handleCreateCategory = async () => {
    const trimmedName = newCategoryName.trim();
    if (!trimmedName) {
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const created = await onCreateCustomCategory({
        name: trimmedName,
        type,
        icon: selectedIcon,
        color: selectedColor,
      });
      onSelectCategory(created.id);
      setNewCategoryName('');
      setIsSearchOpen(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to create category';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenSearchWithQuery = (prefill = '') => {
    setSearchQuery(prefill);
    setNewCategoryName(prefill);
    setErrorMessage(null);
    setIsSearchOpen(true);
  };

  return (
    <View className="w-full">
      {/* Header Row */}
      <View className="flex-row justify-between items-center mb-2 px-0.5 gap-2">
        <View className="flex-1 min-w-0">
          {hasSplits ? (
            <View className="flex-row items-center gap-1.5">
              <AppIcon name="split" size={13} color={theme.primary} />
              <ThemedText
                numeric
                className="text-xs font-bold text-brand-500 dark:text-brand-400 flex-1"
                numberOfLines={1}
              >
                Split across {splits?.length} categories
              </ThemedText>
            </View>
          ) : (
            <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
              Category
            </ThemedText>
          )}
        </View>

        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Split Editor"
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            className={`min-h-[44px] px-3 py-1.5 rounded-full border flex-row items-center justify-center gap-1.5 active:opacity-75 ${
              hasSplits
                ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-200 dark:border-ledger-border-dark'
                : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
            }`}
            onPress={onOpenSplitEditor}
          >
            <AppIcon
              name="split"
              size={14}
              color={hasSplits ? theme.primary : theme.textSecondary}
            />
            <ThemedText
              className={`text-xs font-bold ${
                hasSplits
                  ? 'text-brand-500 dark:text-brand-400'
                  : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
              }`}
            >
              Split
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search all categories"
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            className="min-h-[44px] px-3 py-1.5 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
            onPress={() => handleOpenSearchWithQuery('')}
          >
            <AppIcon name="search" size={14} color={theme.textSecondary} />
            <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
              All
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {/* Pinned Grid (equal 4-column rows) */}
      <View className="gap-2">
        {gridRows.map((row, rowIndex) => (
          <View key={`cat-row-${rowIndex}`} className="flex-row gap-2">
            {row.map((tile, colIndex) => {
              if (!tile) {
                return <View key={`spacer-${rowIndex}-${colIndex}`} className="flex-1" />;
              }

              if (tile.kind === 'more') {
                return (
                  <Pressable
                    key="more-categories"
                    accessibilityRole="button"
                    accessibilityLabel="Browse more categories"
                    className="flex-1 min-h-[68px] rounded-2xl px-1.5 py-2 items-center justify-center bg-ledger-subtle dark:bg-ledger-subtle-dark border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark active:scale-95"
                    onPress={() => handleOpenSearchWithQuery('')}
                  >
                    <View className="mb-1">
                      <AppIcon name="add" size={20} color={theme.textSecondary} />
                    </View>
                    <ThemedText
                      className="text-[11px] font-semibold text-center text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      More
                    </ThemedText>
                  </Pressable>
                );
              }

              const { category } = tile;
              const isSelected =
                selectedCategoryId === category.id || splitCategoryIds.has(category.id);

              return (
                <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Select category ${category.name}`}
                  accessibilityState={{ selected: isSelected }}
                  className={`flex-1 min-h-[68px] rounded-2xl px-1.5 py-2 items-center justify-center relative active:scale-95 ${
                    isSelected
                      ? 'border-2'
                      : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark'
                  }`}
                  style={
                    isSelected
                      ? {
                          backgroundColor: `${category.color}18`,
                          borderColor: category.color,
                        }
                      : undefined
                  }
                  onPress={() => onSelectCategory(category.id)}
                >
                  <ThemedText className="text-xl mb-1">{category.icon}</ThemedText>
                  <ThemedText
                    className={`text-[11px] text-center ${
                      isSelected
                        ? 'font-bold'
                        : 'font-medium text-ledger-ink dark:text-ledger-ink-dark'
                    }`}
                    style={isSelected ? { color: category.color } : undefined}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                    ellipsizeMode="tail"
                  >
                    {category.name}
                  </ThemedText>
                  {isSelected && (
                    <View
                      className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {/* Expandable Full Search Modal */}
      <Modal
        visible={isSearchOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsSearchOpen(false)}
      >
        <SafeAreaView
          className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark"
          edges={['top', 'bottom', 'left', 'right']}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <ThemedView className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark px-4 pt-4">
              {/* Modal Header */}
              <View className="flex-row justify-between items-center mb-4">
                <View>
                  <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Categories · {type === 'EXPENSE' ? 'Expense' : 'Income'}
                  </ThemedText>
                  <ThemedText className="text-2xl font-bold tracking-tight text-ledger-ink dark:text-ledger-ink-dark">
                    Select Category
                  </ThemedText>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close category search"
                  className="min-h-[44px] px-4 py-2 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
                  onPress={() => setIsSearchOpen(false)}
                >
                  <AppIcon name="close" size={14} color={theme.textSecondary} />
                  <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Done
                  </ThemedText>
                </Pressable>
              </View>

              {/* Search Input */}
              <View className="mb-3">
                <TextInput
                  className="h-12 rounded-xl border px-3.5 text-base bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark"
                  placeholder="Search category name..."
                  placeholderTextColor={theme.textMuted}
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    setNewCategoryName(text);
                  }}
                  clearButtonMode="while-editing"
                />
              </View>

              {/* Scrollable Category List */}
              <ScrollView
                className="flex-1"
                contentContainerClassName="pb-10 gap-2"
                keyboardShouldPersistTaps="handled"
              >
                {filteredCategories.length === 0 ? (
                  <View className="p-8 items-center justify-center">
                    <ThemedText className="text-sm font-medium text-ledger-ink-muted dark:text-ledger-ink-dark-muted text-center">
                      No matching category found for &quot;{searchQuery}&quot;
                    </ThemedText>
                  </View>
                ) : (
                  filteredCategories.map((cat) => {
                    const isSelected =
                      selectedCategoryId === cat.id || splitCategoryIds.has(cat.id);

                    return (
                      <Pressable
                        key={cat.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Choose category ${cat.name}`}
                        className={`min-h-[56px] flex-row justify-between items-center p-3 rounded-2xl border mb-1.5 active:scale-[0.99] ${
                          isSelected
                            ? 'border-2'
                            : 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border dark:border-ledger-border-dark'
                        }`}
                        style={
                          isSelected
                            ? {
                                backgroundColor: `${cat.color}15`,
                                borderColor: cat.color,
                              }
                            : undefined
                        }
                        onPress={() => {
                          onSelectCategory(cat.id);
                          setIsSearchOpen(false);
                        }}
                      >
                        <View className="flex-row items-center gap-3 flex-1 min-w-0">
                          <ThemedText className="text-2xl">{cat.icon}</ThemedText>
                          <View className="flex-1 min-w-0">
                            <ThemedText
                              className={`text-base ${
                                isSelected
                                  ? 'font-bold'
                                  : 'font-semibold text-ledger-ink dark:text-ledger-ink-dark'
                              }`}
                              style={isSelected ? { color: cat.color } : undefined}
                              numberOfLines={1}
                            >
                              {cat.name}
                            </ThemedText>
                            {cat.isCustom && (
                              <ThemedText className="text-[11px] font-medium text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                                Custom
                              </ThemedText>
                            )}
                          </View>
                        </View>

                        <View className="flex-row items-center gap-2">
                          {cat.usageCount > 0 && (
                            <View className="px-2 py-0.5 rounded-md bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
                              <ThemedText
                                numeric
                                className="text-[11px] font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                              >
                                {cat.usageCount} uses
                              </ThemedText>
                            </View>
                          )}
                          <View
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                          {isSelected && (
                            <AppIcon name="check" size={16} color={cat.color} />
                          )}
                        </View>
                      </Pressable>
                    );
                  })
                )}

                {/* Quick Create Custom Category Section */}
                <View className="mt-4 p-4 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark">
                  <View className="flex-row items-center gap-1.5 mb-3">
                    <AppIcon name="add" size={16} color={theme.primary} />
                    <ThemedText className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark">
                      Create Custom Category
                    </ThemedText>
                  </View>

                  <TextInput
                    className="h-12 rounded-xl border border-ledger-border-strong dark:border-ledger-border-strong-dark px-3.5 text-sm bg-ledger-subtle dark:bg-ledger-subtle-dark text-ledger-ink dark:text-ledger-ink-dark"
                    placeholder="Category name (e.g. Subscriptions)"
                    placeholderTextColor={theme.textMuted}
                    value={newCategoryName}
                    onChangeText={setNewCategoryName}
                    maxLength={40}
                  />

                  {/* Icon preset picker */}
                  <ThemedText className="text-xs font-semibold text-ledger-ink-muted dark:text-ledger-ink-dark-muted mt-3 mb-1.5">
                    Choose Icon
                  </ThemedText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerClassName="gap-2 py-1"
                  >
                    {PRESET_ICONS.map((icon) => (
                      <Pressable
                        key={icon}
                        accessibilityRole="button"
                        accessibilityLabel={`Select icon ${icon}`}
                        className={`min-w-[44px] min-h-[44px] px-3 py-2 rounded-xl border items-center justify-center active:scale-95 ${
                          selectedIcon === icon
                            ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                            : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
                        }`}
                        onPress={() => setSelectedIcon(icon)}
                      >
                        <ThemedText className="text-xl">{icon}</ThemedText>
                      </Pressable>
                    ))}
                  </ScrollView>

                  {/* Color preset picker */}
                  <ThemedText className="text-xs font-semibold text-ledger-ink-muted dark:text-ledger-ink-dark-muted mt-3 mb-1.5">
                    Choose Color
                  </ThemedText>
                  <View className="flex-row flex-wrap gap-2 mb-4">
                    {PRESET_COLORS.map((color) => (
                      <Pressable
                        key={color}
                        accessibilityRole="button"
                        accessibilityLabel={`Select color ${color}`}
                        className={`min-w-[44px] min-h-[44px] rounded-full items-center justify-center border-2 ${
                          selectedColor === color
                            ? 'border-ledger-ink dark:border-ledger-ink-dark'
                            : 'border-transparent'
                        }`}
                        onPress={() => setSelectedColor(color)}
                      >
                        <View
                          className="w-7 h-7 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                      </Pressable>
                    ))}
                  </View>

                  {errorMessage && (
                    <View
                      accessibilityRole="alert"
                      className="flex-row items-center gap-1.5 mb-2"
                    >
                      <AppIcon name="warning" size={14} color={theme.negative} />
                      <ThemedText className="flex-1 text-xs font-medium text-ledger-terracotta dark:text-ledger-terracotta-dark">
                        {errorMessage}
                      </ThemedText>
                    </View>
                  )}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Create and select category"
                    disabled={!newCategoryName.trim() || isSubmitting}
                    className={`min-h-[44px] h-12 rounded-xl items-center justify-center mt-1 active:scale-[0.98] ${
                      !newCategoryName.trim() || isSubmitting
                        ? 'bg-ledger-selected dark:bg-ledger-selected-dark border border-ledger-border dark:border-ledger-border-dark opacity-70'
                        : 'bg-brand-500 dark:bg-brand-400 active:opacity-90'
                    }`}
                    onPress={handleCreateCategory}
                  >
                    <ThemedText
                      className={`text-sm font-bold ${
                        !newCategoryName.trim() || isSubmitting
                          ? 'text-ledger-ink-muted dark:text-ledger-ink-dark-muted'
                          : 'text-ledger-canvas dark:text-ledger-canvas-dark'
                      }`}
                    >
                      {isSubmitting ? 'Creating...' : 'Create & Select Category'}
                    </ThemedText>
                  </Pressable>
                </View>
              </ScrollView>
            </ThemedView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
