import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { ThemedView } from '@/common/components/themed-view';
import { useTheme } from '@/common/hooks/use-theme';

export interface TransactionMetadataState {
  occurredAt: string;
  merchant: string;
  tags: string[];
  note: string;
  receiptUri?: string;
}

export interface MetadataPillBarProps {
  value: TransactionMetadataState;
  recentMerchants: readonly string[];
  knownTags: readonly string[];
  onChange: (next: TransactionMetadataState) => void;
}

type ActiveModal = 'NONE' | 'TIMESTAMP' | 'MERCHANT' | 'TAGS' | 'NOTE' | 'RECEIPT';

function formatTimestampPill(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (60 * 1000));

    if (diffMins >= -1 && diffMins < 5) {
      return 'Now';
    }

    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `Today ${hours}:${minutes}`;
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return 'Yesterday';
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch (error: unknown) {
    return 'Date';
  }
}

export function MetadataPillBar({
  value,
  recentMerchants,
  knownTags,
  onChange,
}: MetadataPillBarProps) {
  const theme = useTheme();
  const [activeModal, setActiveModal] = useState<ActiveModal>('NONE');

  // Draft state for modal inputs
  const [draftMerchant, setDraftMerchant] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [receiptFeedback, setReceiptFeedback] = useState<string | null>(null);

  const openModal = (modal: ActiveModal) => {
    if (modal === 'MERCHANT') {
      setDraftMerchant(value.merchant);
    } else if (modal === 'NOTE') {
      setDraftNote(value.note);
    } else if (modal === 'TAGS') {
      setNewTagInput('');
    } else if (modal === 'RECEIPT') {
      setReceiptFeedback(null);
    }
    setActiveModal(modal);
  };

  const closeModal = () => {
    setActiveModal('NONE');
  };

  // Timestamp Actions
  const handleSelectTimestamp = (iso: string) => {
    onChange({ ...value, occurredAt: iso });
    closeModal();
  };

  // Merchant Actions
  const handleSaveMerchant = (merchantName: string) => {
    onChange({ ...value, merchant: merchantName.trim() });
    closeModal();
  };

  const handleClearMerchant = () => {
    onChange({ ...value, merchant: '' });
    closeModal();
  };

  // Tag Actions
  const handleToggleTag = (tag: string) => {
    const normalized = tag.replace(/^#/, '').trim();
    if (!normalized) {
      return;
    }
    const current = value.tags;
    const next = current.includes(normalized)
      ? current.filter((t) => t !== normalized)
      : [...current, normalized];
    onChange({ ...value, tags: next });
  };

  const handleAddNewTag = () => {
    const normalized = newTagInput.replace(/^#/, '').trim();
    if (!normalized) {
      return;
    }
    if (!value.tags.includes(normalized)) {
      onChange({ ...value, tags: [...value.tags, normalized] });
    }
    setNewTagInput('');
  };

  // Note Actions
  const handleSaveNote = () => {
    onChange({ ...value, note: draftNote.trim() });
    closeModal();
  };

  const handleClearNote = () => {
    onChange({ ...value, note: '' });
    closeModal();
  };

  // Receipt Actions
  const handlePickFromLibrary = async () => {
    try {
      setReceiptFeedback(null);
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setReceiptFeedback('Photo library permission denied. You can still use Demo Receipt.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        onChange({ ...value, receiptUri: result.assets[0].uri });
        closeModal();
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error picking image';
      setReceiptFeedback(msg);
    }
  };

  const handleTakePhoto = async () => {
    try {
      setReceiptFeedback(null);
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setReceiptFeedback('Camera permission denied. You can still use Demo Receipt.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        onChange({ ...value, receiptUri: result.assets[0].uri });
        closeModal();
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error launching camera';
      setReceiptFeedback(msg);
    }
  };

  const handleAttachDemoReceipt = () => {
    const demoUri = `local://receipt-${Date.now()}.jpg`;
    onChange({ ...value, receiptUri: demoUri });
    closeModal();
  };

  const handleRemoveReceipt = () => {
    onChange({ ...value, receiptUri: undefined });
    closeModal();
  };

  const allAvailableTags = Array.from(
    new Set([...knownTags, ...value.tags]),
  );

  return (
    <View className="w-full">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 py-0.5"
      >
        {/* Pill 1: Timestamp */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change date and time"
          className="min-h-[44px] rounded-full px-3.5 py-2 bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark active:opacity-75 flex-row items-center justify-center gap-1.5"
          onPress={() => openModal('TIMESTAMP')}
        >
          <AppIcon name="calendar" size={14} color={theme.textSecondary} />
          <ThemedText
            numeric
            className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
            numberOfLines={1}
          >
            {formatTimestampPill(value.occurredAt)}
          </ThemedText>
        </Pressable>

        {/* Pill 2: Merchant */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Set merchant"
          className={`min-h-[44px] rounded-full px-3.5 py-2 border active:opacity-75 flex-row items-center justify-center gap-1.5 ${
            value.merchant
              ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-200 dark:border-ledger-border-dark'
              : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
          }`}
          onPress={() => openModal('MERCHANT')}
        >
          <AppIcon
            name="merchant"
            size={14}
            color={value.merchant ? theme.primary : theme.textSecondary}
          />
          <ThemedText
            className={`text-xs ${
              value.merchant
                ? 'font-bold text-brand-500 dark:text-brand-400'
                : 'font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
            }`}
            numberOfLines={1}
          >
            {value.merchant ? value.merchant : 'Merchant'}
          </ThemedText>
        </Pressable>

        {/* Pill 3: Tags */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add or edit tags"
          className={`min-h-[44px] rounded-full px-3.5 py-2 border active:opacity-75 flex-row items-center justify-center gap-1.5 ${
            value.tags.length > 0
              ? 'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border-ledger-border dark:border-ledger-border-dark'
              : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
          }`}
          onPress={() => openModal('TAGS')}
        >
          <AppIcon
            name="tag"
            size={14}
            color={value.tags.length > 0 ? theme.positive : theme.textSecondary}
          />
          <ThemedText
            className={`text-xs ${
              value.tags.length > 0
                ? 'font-bold text-ledger-pine dark:text-ledger-pine-dark'
                : 'font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
            }`}
            numberOfLines={1}
          >
            {value.tags.length > 0 ? `#${value.tags.join(' #')}` : '#Tags'}
          </ThemedText>
        </Pressable>

        {/* Pill 4: Note */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add note"
          className={`min-h-[44px] rounded-full px-3.5 py-2 border active:opacity-75 flex-row items-center justify-center gap-1.5 ${
            value.note
              ? 'bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft border-ledger-border dark:border-ledger-border-dark'
              : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
          }`}
          onPress={() => openModal('NOTE')}
        >
          <AppIcon
            name="note"
            size={14}
            color={value.note ? theme.warning : theme.textSecondary}
          />
          <ThemedText
            className={`text-xs ${
              value.note
                ? 'font-bold text-ledger-ochre dark:text-ledger-ochre-dark'
                : 'font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
            }`}
            numberOfLines={1}
          >
            {value.note ? value.note : 'Note'}
          </ThemedText>
        </Pressable>

        {/* Pill 5: Receipt */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach receipt"
          className={`min-h-[44px] rounded-full px-3.5 py-2 border active:opacity-75 flex-row items-center justify-center gap-1.5 ${
            value.receiptUri
              ? 'bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft border-ledger-border dark:border-ledger-border-dark'
              : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
          }`}
          onPress={() => openModal('RECEIPT')}
        >
          <AppIcon
            name="receipt"
            size={14}
            color={value.receiptUri ? theme.info : theme.textSecondary}
          />
          <ThemedText
            className={`text-xs ${
              value.receiptUri
                ? 'font-bold text-ledger-teal dark:text-ledger-teal-dark'
                : 'font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
            }`}
            numberOfLines={1}
          >
            Receipt
          </ThemedText>
          {Boolean(value.receiptUri) && (
            <AppIcon name="check" size={13} color={theme.info} />
          )}
        </Pressable>
      </ScrollView>

      {/* MODAL 1: Timestamp Presets */}
      <Modal
        visible={activeModal === 'TIMESTAMP'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <SafeAreaView
          className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark"
          edges={['top', 'bottom', 'left', 'right']}
        >
          <ThemedView className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark px-4 pt-4">
            <View className="flex-row justify-between items-center mb-4">
              <ThemedText className="text-2xl font-bold tracking-tight text-ledger-ink dark:text-ledger-ink-dark">
                Select Time
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close time selector"
                className="min-h-[44px] px-4 py-2 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
                onPress={closeModal}
              >
                <AppIcon name="close" size={14} color={theme.textSecondary} />
                <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Done
                </ThemedText>
              </Pressable>
            </View>

            <View className="gap-2.5">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select right now"
                className="min-h-[56px] p-4 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row justify-between items-center active:scale-[0.99]"
                onPress={() => handleSelectTimestamp(new Date().toISOString())}
              >
                <View className="flex-row items-center gap-2.5">
                  <AppIcon name="calendar" size={18} color={theme.primary} />
                  <ThemedText className="text-base font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                    Right Now
                  </ThemedText>
                </View>
                <ThemedText className="text-xs font-medium text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Current time
                </ThemedText>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select 2 hours ago"
                className="min-h-[56px] p-4 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row justify-between items-center active:scale-[0.99]"
                onPress={() =>
                  handleSelectTimestamp(
                    new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                  )
                }
              >
                <View className="flex-row items-center gap-2.5">
                  <AppIcon name="calendar" size={18} color={theme.primary} />
                  <ThemedText
                    numeric
                    className="text-base font-semibold text-ledger-ink dark:text-ledger-ink-dark"
                  >
                    Earlier Today (-2 hrs)
                  </ThemedText>
                </View>
                <ThemedText
                  numeric
                  className="text-xs font-medium text-ledger-ink-muted dark:text-ledger-ink-dark-muted"
                >
                  2 hours ago
                </ThemedText>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select yesterday"
                className="min-h-[56px] p-4 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row justify-between items-center active:scale-[0.99]"
                onPress={() =>
                  handleSelectTimestamp(
                    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                  )
                }
              >
                <View className="flex-row items-center gap-2.5">
                  <AppIcon name="calendar" size={18} color={theme.primary} />
                  <ThemedText className="text-base font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                    Yesterday
                  </ThemedText>
                </View>
                <ThemedText
                  numeric
                  className="text-xs font-medium text-ledger-ink-muted dark:text-ledger-ink-dark-muted"
                >
                  24 hours ago
                </ThemedText>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select 2 days ago"
                className="min-h-[56px] p-4 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row justify-between items-center active:scale-[0.99]"
                onPress={() =>
                  handleSelectTimestamp(
                    new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
                  )
                }
              >
                <View className="flex-row items-center gap-2.5">
                  <AppIcon name="calendar" size={18} color={theme.primary} />
                  <ThemedText
                    numeric
                    className="text-base font-semibold text-ledger-ink dark:text-ledger-ink-dark"
                  >
                    2 Days Ago
                  </ThemedText>
                </View>
                <ThemedText
                  numeric
                  className="text-xs font-medium text-ledger-ink-muted dark:text-ledger-ink-dark-muted"
                >
                  48 hours ago
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        </SafeAreaView>
      </Modal>

      {/* MODAL 2: Merchant Entry & Quick Chips */}
      <Modal
        visible={activeModal === 'MERCHANT'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
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
              <View className="flex-row justify-between items-center mb-4">
                <ThemedText className="text-2xl font-bold tracking-tight text-ledger-ink dark:text-ledger-ink-dark">
                  Merchant Name
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close merchant selector"
                  className="min-h-[44px] px-4 py-2 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
                  onPress={closeModal}
                >
                  <AppIcon name="close" size={14} color={theme.textSecondary} />
                  <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Done
                  </ThemedText>
                </Pressable>
              </View>

              <ScrollView
                className="flex-1"
                contentContainerClassName="pb-10"
                keyboardShouldPersistTaps="handled"
              >
                <TextInput
                  className="h-12 rounded-xl border border-ledger-border-strong dark:border-ledger-border-strong-dark px-4 text-base bg-ledger-surface dark:bg-ledger-surface-dark text-ledger-ink dark:text-ledger-ink-dark mb-4"
                  placeholder="e.g. Trader Joe's, Target, Uber..."
                  placeholderTextColor={theme.textMuted}
                  value={draftMerchant}
                  onChangeText={setDraftMerchant}
                  autoFocus
                  clearButtonMode="while-editing"
                />

                <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted mb-2.5">
                  Recent Merchants (Tap to Pick)
                </ThemedText>

                <View className="flex-row flex-wrap gap-2">
                  {recentMerchants.map((merchant) => {
                    const isPicked = draftMerchant === merchant;
                    return (
                      <Pressable
                        key={merchant}
                        accessibilityRole="button"
                        accessibilityLabel={`Pick merchant ${merchant}`}
                        className={`min-h-[44px] px-3.5 py-2 rounded-xl border flex-row items-center justify-center gap-1.5 active:scale-95 ${
                          isPicked
                            ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                            : 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border dark:border-ledger-border-dark'
                        }`}
                        onPress={() => setDraftMerchant(merchant)}
                      >
                        <AppIcon
                          name="merchant"
                          size={14}
                          color={isPicked ? theme.primary : theme.textSecondary}
                        />
                        <ThemedText
                          className={`text-xs ${
                            isPicked
                              ? 'font-bold text-brand-500 dark:text-brand-400'
                              : 'font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                          }`}
                        >
                          {merchant}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                <View className="flex-row justify-end gap-3 mt-6">
                  {value.merchant ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear merchant"
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                      onPress={handleClearMerchant}
                    >
                      <ThemedText className="text-xs font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                        Clear Merchant
                      </ThemedText>
                    </Pressable>
                  ) : null}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Save merchant"
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-brand-500 dark:bg-brand-400 active:opacity-90 items-center justify-center"
                    onPress={() => handleSaveMerchant(draftMerchant)}
                  >
                    <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                      Save Merchant
                    </ThemedText>
                  </Pressable>
                </View>
              </ScrollView>
            </ThemedView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* MODAL 3: Tag Chips & Custom Tag */}
      <Modal
        visible={activeModal === 'TAGS'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
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
              <View className="flex-row justify-between items-center mb-4">
                <ThemedText className="text-2xl font-bold tracking-tight text-ledger-ink dark:text-ledger-ink-dark">
                  Manage Tags
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close tags manager"
                  className="min-h-[44px] px-4 py-2 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
                  onPress={closeModal}
                >
                  <AppIcon name="close" size={14} color={theme.textSecondary} />
                  <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Done
                  </ThemedText>
                </Pressable>
              </View>

              <ScrollView
                className="flex-1"
                contentContainerClassName="pb-10"
                keyboardShouldPersistTaps="handled"
              >
                {/* New tag input */}
                <View className="flex-row gap-2.5 items-center mb-4">
                  <TextInput
                    className="flex-1 h-12 rounded-xl border border-ledger-border-strong dark:border-ledger-border-strong-dark px-4 text-base bg-ledger-surface dark:bg-ledger-surface-dark text-ledger-ink dark:text-ledger-ink-dark"
                    placeholder="Add custom tag (e.g. coffee-run)"
                    placeholderTextColor={theme.textMuted}
                    value={newTagInput}
                    onChangeText={setNewTagInput}
                    onSubmitEditing={handleAddNewTag}
                    maxLength={32}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add tag"
                    className={`min-h-[48px] h-12 px-4 rounded-xl items-center justify-center active:scale-95 ${
                      newTagInput.trim()
                        ? 'bg-ledger-pine dark:bg-ledger-pine-dark active:opacity-90'
                        : 'bg-ledger-selected dark:bg-ledger-selected-dark border border-ledger-border dark:border-ledger-border-dark opacity-70'
                    }`}
                    disabled={!newTagInput.trim()}
                    onPress={handleAddNewTag}
                  >
                    <ThemedText
                      className={`text-xs font-bold ${
                        newTagInput.trim()
                          ? 'text-ledger-canvas dark:text-ledger-canvas-dark'
                          : 'text-ledger-ink-muted dark:text-ledger-ink-dark-muted'
                      }`}
                    >
                      Add #
                    </ThemedText>
                  </Pressable>
                </View>

                <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted mb-2.5">
                  Toggle Tags
                </ThemedText>

                <View className="flex-row flex-wrap gap-2">
                  {allAvailableTags.map((tag) => {
                    const isSelected = value.tags.includes(tag);
                    return (
                      <Pressable
                        key={tag}
                        accessibilityRole="button"
                        accessibilityLabel={`Toggle tag ${tag}`}
                        accessibilityState={{ selected: isSelected }}
                        className={`min-h-[44px] px-3.5 py-2 rounded-xl border flex-row items-center justify-center gap-1.5 active:scale-95 ${
                          isSelected
                            ? 'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border-ledger-pine dark:border-ledger-pine-dark'
                            : 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border dark:border-ledger-border-dark'
                        }`}
                        onPress={() => handleToggleTag(tag)}
                      >
                        <ThemedText
                          className={`text-xs ${
                            isSelected
                              ? 'font-bold text-ledger-pine dark:text-ledger-pine-dark'
                              : 'font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                          }`}
                        >
                          #{tag}
                        </ThemedText>
                        {isSelected && (
                          <AppIcon name="check" size={13} color={theme.positive} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </ThemedView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* MODAL 4: Note Editor */}
      <Modal
        visible={activeModal === 'NOTE'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
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
              <View className="flex-row justify-between items-center mb-4">
                <ThemedText className="text-2xl font-bold tracking-tight text-ledger-ink dark:text-ledger-ink-dark">
                  Transaction Note
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close note editor"
                  className="min-h-[44px] px-4 py-2 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
                  onPress={closeModal}
                >
                  <AppIcon name="close" size={14} color={theme.textSecondary} />
                  <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Done
                  </ThemedText>
                </Pressable>
              </View>

              <ScrollView
                className="flex-1"
                contentContainerClassName="pb-10"
                keyboardShouldPersistTaps="handled"
              >
                <TextInput
                  className="h-32 rounded-xl border border-ledger-border-strong dark:border-ledger-border-strong-dark p-4 text-base bg-ledger-surface dark:bg-ledger-surface-dark text-ledger-ink dark:text-ledger-ink-dark mb-4"
                  placeholder="Add details, reimbursement memo, or description..."
                  placeholderTextColor={theme.textMuted}
                  value={draftNote}
                  onChangeText={setDraftNote}
                  multiline
                  numberOfLines={4}
                  maxLength={280}
                  autoFocus
                  textAlignVertical="top"
                />

                <View className="flex-row justify-end gap-3 mt-2">
                  {value.note ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear note"
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                      onPress={handleClearNote}
                    >
                      <ThemedText className="text-xs font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                        Clear Note
                      </ThemedText>
                    </Pressable>
                  ) : null}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Save note"
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-brand-500 dark:bg-brand-400 active:opacity-90 items-center justify-center"
                    onPress={handleSaveNote}
                  >
                    <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                      Save Note
                    </ThemedText>
                  </Pressable>
                </View>
              </ScrollView>
            </ThemedView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* MODAL 5: Receipt Attachment */}
      <Modal
        visible={activeModal === 'RECEIPT'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <SafeAreaView
          className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark"
          edges={['top', 'bottom', 'left', 'right']}
        >
          <ThemedView className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark px-4 pt-4">
            <View className="flex-row justify-between items-center mb-4">
              <ThemedText className="text-2xl font-bold tracking-tight text-ledger-ink dark:text-ledger-ink-dark">
                Receipt Attachment
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close receipt attachment"
                className="min-h-[44px] px-4 py-2 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
                onPress={closeModal}
              >
                <AppIcon name="close" size={14} color={theme.textSecondary} />
                <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Done
                </ThemedText>
              </Pressable>
            </View>

            <ScrollView className="flex-1" contentContainerClassName="pb-10">
              {value.receiptUri ? (
                <View className="rounded-2xl border border-ledger-border dark:border-ledger-border-dark bg-ledger-surface dark:bg-ledger-surface-dark p-4 items-center mb-4 gap-3">
                  {value.receiptUri.startsWith('local://') ? (
                    <View className="items-center gap-1.5">
                      <AppIcon name="receipt" size={32} color={theme.info} />
                      <ThemedText className="text-sm font-bold text-ledger-teal dark:text-ledger-teal-dark">
                        Sample Receipt Attached
                      </ThemedText>
                      <ThemedText
                        className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted"
                        numberOfLines={1}
                      >
                        {value.receiptUri}
                      </ThemedText>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: value.receiptUri }}
                      className="w-full h-44 rounded-xl"
                      resizeMode="cover"
                    />
                  )}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove receipt"
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark active:opacity-90 flex-row items-center justify-center gap-1.5"
                    onPress={handleRemoveReceipt}
                  >
                    <AppIcon name="delete" size={14} color={theme.onPrimary} />
                    <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                      Remove Receipt
                    </ThemedText>
                  </Pressable>
                </View>
              ) : null}

              {receiptFeedback && (
                <View
                  accessibilityRole="alert"
                  className="flex-row items-center gap-1.5 mb-3"
                >
                  <AppIcon name="warning" size={14} color={theme.negative} />
                  <ThemedText className="flex-1 text-xs font-medium text-ledger-terracotta dark:text-ledger-terracotta-dark">
                    {receiptFeedback}
                  </ThemedText>
                </View>
              )}

              <View className="gap-2.5">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Choose photo from library"
                  className="min-h-[56px] p-4 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row justify-between items-center active:scale-[0.99]"
                  onPress={handlePickFromLibrary}
                >
                  <View className="flex-row items-center gap-2.5 flex-1 pr-2">
                    <AppIcon name="file" size={18} color={theme.primary} />
                    <ThemedText className="text-base font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                      Choose Photo from Library
                    </ThemedText>
                  </View>
                  <ThemedText className="text-xs font-medium text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Select existing photo
                  </ThemedText>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Take photo with camera"
                  className="min-h-[56px] p-4 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row justify-between items-center active:scale-[0.99]"
                  onPress={handleTakePhoto}
                >
                  <View className="flex-row items-center gap-2.5 flex-1 pr-2">
                    <AppIcon name="receipt" size={18} color={theme.primary} />
                    <ThemedText className="text-base font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                      Take Photo with Camera
                    </ThemedText>
                  </View>
                  <ThemedText className="text-xs font-medium text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Capture receipt now
                  </ThemedText>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Attach sample receipt"
                  className="min-h-[56px] p-4 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row justify-between items-center active:scale-[0.99]"
                  onPress={handleAttachDemoReceipt}
                >
                  <View className="flex-row items-center gap-2.5 flex-1 pr-2">
                    <AppIcon name="autopay" size={18} color={theme.primary} />
                    <ThemedText className="text-base font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                      Attach Sample Receipt (Demo)
                    </ThemedText>
                  </View>
                  <ThemedText className="text-xs font-medium text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Simulator / Web 1-tap test
                  </ThemedText>
                </Pressable>
              </View>
            </ScrollView>
          </ThemedView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
