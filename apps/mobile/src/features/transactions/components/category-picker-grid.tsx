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
import { ThemedText } from '@/common/components/themed-text';
import { ThemedView } from '@/common/components/themed-view';

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

const PRESET_ICONS = ['🏷️', '🛒', '🍔', '🚗', '🎮', '🐾', '🎁', '🛠️', '📚', '🏥'] as const;
const PRESET_COLORS = ['#208AEF', '#10B981', '#F97316', '#8B5CF6', '#EC4899', '#EF4444'] as const;

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

  // Up to 7 pinned categories to leave room for the "+ More" tile (total 8 in a 2x4 grid)
  const displayPinned = useMemo(() => {
    return pinnedCategories.slice(0, 7);
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
      <View className="flex-row justify-between items-center mb-2.5 px-1">
        <View className="flex-1">
          {hasSplits ? (
            <ThemedText className="text-xs font-bold text-brand-500">
              Split across {splits?.length} categories
            </ThemedText>
          ) : (
            <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Category
            </ThemedText>
          )}
        </View>

        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Split Editor"
            className={`px-3 py-1.5 rounded-full border active:opacity-75 ${
              hasSplits
                ? 'bg-brand-50 dark:bg-brand-950/60 border-brand-500/50'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
            onPress={onOpenSplitEditor}
          >
            <ThemedText
              className={`text-xs font-bold ${
                hasSplits ? 'text-brand-500' : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              Split
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search all categories"
            className="px-3 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 active:opacity-75"
            onPress={() => handleOpenSearchWithQuery('')}
          >
            <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
              All
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {/* Pinned Grid (2 rows x 4 columns) */}
      <View className="flex-row flex-wrap gap-2">
        {displayPinned.map((category) => {
          const isSelected =
            selectedCategoryId === category.id || splitCategoryIds.has(category.id);

          return (
            <Pressable
              key={category.id}
              accessibilityRole="button"
              accessibilityLabel={`Select category ${category.name}`}
              className={`min-h-[64px] rounded-2xl p-1.5 sm:p-2 items-center justify-center relative active:scale-95 transition-all ${
                isSelected
                  ? 'border-2'
                  : 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800'
              }`}
              style={[
                { width: '22.8%' },
                isSelected
                  ? {
                      backgroundColor: `${category.color}18`,
                      borderColor: category.color,
                    }
                  : undefined,
              ]}
              onPress={() => onSelectCategory(category.id)}
            >
              <ThemedText className="text-2xl mb-1">{category.icon}</ThemedText>
              <ThemedText
                className={`text-[10px] sm:text-[11px] text-center ${
                  isSelected
                    ? 'font-bold'
                    : 'font-medium text-slate-700 dark:text-slate-300'
                }`}
                style={isSelected ? { color: category.color } : undefined}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                ellipsizeMode="tail"
              >
                {category.name}
              </ThemedText>
              {isSelected && (
                <View
                  className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
              )}
            </Pressable>
          );
        })}

        {/* More Tile */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Browse more categories"
          className="min-h-[64px] rounded-2xl p-1.5 sm:p-2 items-center justify-center bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 active:scale-95 transition-all"
          style={{ width: '22.8%' }}
          onPress={() => handleOpenSearchWithQuery('')}
        >
          <ThemedText className="text-2xl mb-1">+</ThemedText>
          <ThemedText
            className="text-[10px] sm:text-[11px] font-medium text-center text-slate-600 dark:text-slate-400"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            More
          </ThemedText>
        </Pressable>
      </View>

      {/* Expandable Full Search Modal */}
      <Modal
        visible={isSearchOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsSearchOpen(false)}
      >
        <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'bottom', 'left', 'right']}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
          <ThemedView className="flex-1 bg-slate-50 dark:bg-slate-950 px-4 pt-4">
          {/* Modal Header */}
          <View className="flex-row justify-between items-center mb-4">
            <View>
              <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                CATEGORIES ({type === 'EXPENSE' ? 'EXPENSE' : 'INCOME'})
              </ThemedText>
              <ThemedText className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                Select Category
              </ThemedText>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close category search"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="min-h-[44px] px-4 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 items-center justify-center active:opacity-75"
              onPress={() => setIsSearchOpen(false)}
            >
              <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Done
              </ThemedText>
            </Pressable>
          </View>

          {/* Search Input */}
          <View className="mb-3">
            <TextInput
              className="h-11 rounded-2xl border px-3.5 text-base bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
              placeholder="Search category name..."
              placeholderTextColor="#94A3B8"
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
                <ThemedText className="text-sm font-medium text-slate-400 dark:text-slate-500">
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
                    className={`flex-row justify-between items-center p-3 rounded-2xl border mb-1.5 active:scale-[0.99] transition-all ${
                      isSelected
                        ? 'border-2'
                        : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
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
                    <View className="flex-row items-center gap-3">
                      <ThemedText className="text-2xl">{cat.icon}</ThemedText>
                      <View>
                        <ThemedText
                          className={`text-base ${
                            isSelected
                              ? 'font-bold'
                              : 'font-semibold text-slate-800 dark:text-slate-100'
                          }`}
                          style={isSelected ? { color: cat.color } : undefined}
                        >
                          {cat.name}
                        </ThemedText>
                        {cat.isCustom && (
                          <ThemedText className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                            Custom
                          </ThemedText>
                        )}
                      </View>
                    </View>

                    <View className="flex-row items-center gap-2">
                      {cat.usageCount > 0 && (
                        <View className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                          <ThemedText className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {cat.usageCount} uses
                          </ThemedText>
                        </View>
                      )}
                      <View
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      {isSelected && (
                        <ThemedText
                          className="text-sm font-bold ml-1"
                          style={{ color: cat.color }}
                        >
                          ✓
                        </ThemedText>
                      )}
                    </View>
                  </Pressable>
                );
              })
            )}

            {/* Quick Create Custom Category Section */}
            <View className="mt-4 p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
              <ThemedText className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
                Create Custom Category
              </ThemedText>

              <TextInput
                className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 text-sm bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100"
                placeholder="Category name (e.g. Subscriptions)"
                placeholderTextColor="#94A3B8"
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                maxLength={40}
              />

              {/* Icon preset picker */}
              <ThemedText className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-3 mb-1.5">
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
                    className={`px-3 py-2 rounded-xl border active:scale-95 ${
                      selectedIcon === icon
                        ? 'bg-brand-50 dark:bg-brand-950/60 border-brand-500'
                        : 'bg-slate-100 dark:bg-slate-800 border-transparent'
                    }`}
                    onPress={() => setSelectedIcon(icon)}
                  >
                    <ThemedText className="text-xl">{icon}</ThemedText>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Color preset picker */}
              <ThemedText className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-3 mb-1.5">
                Choose Color
              </ThemedText>
              <View className="flex-row gap-3 mb-4">
                {PRESET_COLORS.map((color) => (
                  <Pressable
                    key={color}
                    accessibilityRole="button"
                    accessibilityLabel={`Select color ${color}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className={`w-7 h-7 rounded-full ${
                      selectedColor === color
                        ? 'border-2 border-slate-900 dark:border-white scale-110 shadow-sm'
                        : ''
                    }`}
                    style={{ backgroundColor: color }}
                    onPress={() => setSelectedColor(color)}
                  />
                ))}
              </View>

              {errorMessage && (
                <ThemedText className="text-xs font-medium text-rose-500 mb-2">
                  {errorMessage}
                </ThemedText>
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create and select category"
                disabled={!newCategoryName.trim() || isSubmitting}
                className={`h-11 rounded-xl items-center justify-center mt-1 active:scale-[0.98] ${
                  !newCategoryName.trim() || isSubmitting
                    ? 'bg-slate-200 dark:bg-slate-800 opacity-60'
                    : 'bg-brand-500 active:bg-brand-600 shadow-md shadow-brand-500/25'
                }`}
                onPress={handleCreateCategory}
              >
                <ThemedText
                  className={`text-sm font-bold ${
                    !newCategoryName.trim() || isSubmitting
                      ? 'text-slate-400 dark:text-slate-500'
                      : 'text-white'
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
