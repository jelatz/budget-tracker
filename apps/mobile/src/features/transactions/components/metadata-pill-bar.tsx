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
import { ThemedText } from '@/common/components/themed-text';
import { ThemedView } from '@/common/components/themed-view';

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

    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  } catch (error: unknown) {
    return 'Date';
  }
}

function formatLocalDateInput(isoString: string): string {
  const d = new Date(isoString);
  const valid = isNaN(d.getTime()) ? new Date() : d;
  const year = valid.getFullYear();
  const month = String(valid.getMonth() + 1).padStart(2, '0');
  const day = String(valid.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function MetadataPillBar({
  value,
  recentMerchants,
  knownTags,
  onChange,
}: MetadataPillBarProps) {
  const [activeModal, setActiveModal] = useState<ActiveModal>('NONE');

  // Draft state for modal inputs
  const [draftDateInput, setDraftDateInput] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);
  const [draftMerchant, setDraftMerchant] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [receiptFeedback, setReceiptFeedback] = useState<string | null>(null);

  const openModal = (modal: ActiveModal) => {
    if (modal === 'TIMESTAMP') {
      setDraftDateInput(formatLocalDateInput(value.occurredAt));
      setDateError(null);
    } else if (modal === 'MERCHANT') {
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

  const handleApplyCustomDate = () => {
    const trimmed = draftDateInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      setDateError('Enter a valid date in YYYY-MM-DD format (e.g. 2026-11-15).');
      return;
    }

    const [yearStr, monthStr, dayStr] = trimmed.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    const parsed = new Date(year, month - 1, day, 12, 0, 0);
    if (
      isNaN(parsed.getTime()) ||
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) {
      setDateError('That calendar date does not exist. Please double-check month and day.');
      return;
    }

    setDateError(null);
    handleSelectTimestamp(parsed.toISOString());
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

  // Combined Tags list (knownTags union with any current value.tags)
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
          className="rounded-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 active:opacity-75 items-center justify-center"
          onPress={() => openModal('TIMESTAMP')}
        >
          <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-300" numberOfLines={1}>
            {formatTimestampPill(value.occurredAt)}
          </ThemedText>
        </Pressable>

        {/* Pill 2: Merchant */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Set merchant"
          className={`rounded-full px-3.5 py-2 border active:opacity-75 items-center justify-center ${
            value.merchant
              ? 'bg-brand-50 dark:bg-brand-950/60 border-brand-500/50'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
          }`}
          onPress={() => openModal('MERCHANT')}
        >
          <ThemedText
            className={`text-xs ${
              value.merchant
                ? 'font-bold text-brand-500'
                : 'font-semibold text-slate-700 dark:text-slate-300'
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
          className={`rounded-full px-3.5 py-2 border active:opacity-75 items-center justify-center ${
            value.tags.length > 0
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500/50'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
          }`}
          onPress={() => openModal('TAGS')}
        >
          <ThemedText
            className={`text-xs ${
              value.tags.length > 0
                ? 'font-bold text-emerald-600 dark:text-emerald-400'
                : 'font-semibold text-slate-700 dark:text-slate-300'
            }`}
            numberOfLines={1}
          >
            {value.tags.length > 0
              ? `#${value.tags.join(' #')}`
              : '#Tags'}
          </ThemedText>
        </Pressable>

        {/* Pill 4: Note */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add note"
          className={`rounded-full px-3.5 py-2 border active:opacity-75 items-center justify-center ${
            value.note
              ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-500/50'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
          }`}
          onPress={() => openModal('NOTE')}
        >
          <ThemedText
            className={`text-xs ${
              value.note
                ? 'font-bold text-amber-600 dark:text-amber-400'
                : 'font-semibold text-slate-700 dark:text-slate-300'
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
          className={`rounded-full px-3.5 py-2 border active:opacity-75 items-center justify-center ${
            value.receiptUri
              ? 'bg-purple-50 dark:bg-purple-950/60 border-purple-500/50'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
          }`}
          onPress={() => openModal('RECEIPT')}
        >
          <ThemedText
            className={`text-xs ${
              value.receiptUri
                ? 'font-bold text-purple-600 dark:text-purple-400'
                : 'font-semibold text-slate-700 dark:text-slate-300'
            }`}
            numberOfLines={1}
          >
            Receipt
          </ThemedText>
        </Pressable>
      </ScrollView>

      {/* ==================================================================== */}
      {/* MODAL 1: Timestamp Presets */}
      {/* ==================================================================== */}
      <Modal
        visible={activeModal === 'TIMESTAMP'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
            <ThemedView className="flex-1 bg-slate-50 dark:bg-slate-950 px-4 pt-4">
              <View className="flex-row justify-between items-center mb-4">
                <ThemedText className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  Select Time
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close time selector"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  className="min-h-[44px] px-4 py-2 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 items-center justify-center active:opacity-75"
                  onPress={closeModal}
                >
                  <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">Done</ThemedText>
                </Pressable>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerClassName="gap-3 pb-8"
              >
                <View className="gap-2.5">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Set transaction time to Right Now"
                    className="min-h-[44px] p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex-row justify-between items-center active:scale-[0.99]"
                    onPress={() => handleSelectTimestamp(new Date().toISOString())}
                  >
                    <ThemedText className="text-base font-semibold text-slate-800 dark:text-slate-100">Right Now</ThemedText>
                    <ThemedText className="text-xs font-medium text-slate-400 dark:text-slate-500">
                      Current time
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Set transaction time to Earlier Today"
                    className="min-h-[44px] p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex-row justify-between items-center active:scale-[0.99]"
                    onPress={() =>
                      handleSelectTimestamp(
                        new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                      )
                    }
                  >
                    <ThemedText className="text-base font-semibold text-slate-800 dark:text-slate-100">Earlier Today (-2 hrs)</ThemedText>
                    <ThemedText className="text-xs font-medium text-slate-400 dark:text-slate-500">
                      2 hours ago
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Set transaction time to Yesterday"
                    className="min-h-[44px] p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex-row justify-between items-center active:scale-[0.99]"
                    onPress={() =>
                      handleSelectTimestamp(
                        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                      )
                    }
                  >
                    <ThemedText className="text-base font-semibold text-slate-800 dark:text-slate-100">Yesterday</ThemedText>
                    <ThemedText className="text-xs font-medium text-slate-400 dark:text-slate-500">
                      24 hours ago
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Set transaction time to 2 Days Ago"
                    className="min-h-[44px] p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex-row justify-between items-center active:scale-[0.99]"
                    onPress={() =>
                      handleSelectTimestamp(
                        new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
                      )
                    }
                  >
                    <ThemedText className="text-base font-semibold text-slate-800 dark:text-slate-100">2 Days Ago</ThemedText>
                    <ThemedText className="text-xs font-medium text-slate-400 dark:text-slate-500">
                      48 hours ago
                    </ThemedText>
                  </Pressable>
                </View>

                {/* Custom Date Entry */}
                <View className="mt-2 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 gap-3">
                  <View>
                    <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Custom Date (YYYY-MM-DD)
                    </ThemedText>
                    <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Log past expenses or backdated salary deposits
                    </ThemedText>
                  </View>

                  {dateError && (
                    <View className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800">
                      <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                        {dateError}
                      </ThemedText>
                    </View>
                  )}

                  <View className="flex-row items-center gap-2">
                    <TextInput
                      value={draftDateInput}
                      onChangeText={(t) => {
                        setDraftDateInput(t);
                        if (dateError) setDateError(null);
                      }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#94a3b8"
                      accessibilityLabel="Custom transaction date in YYYY-MM-DD format"
                      autoCapitalize="none"
                      autoCorrect={false}
                      className="flex-1 min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono font-semibold"
                    />
                    <Pressable
                      onPress={handleApplyCustomDate}
                      accessibilityRole="button"
                      accessibilityLabel="Apply custom date"
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center"
                    >
                      <ThemedText className="text-xs font-bold text-white">
                        Apply Date
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            </ThemedView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL 2: Merchant Entry & Quick Chips */}
      {/* ==================================================================== */}
      <Modal
        visible={activeModal === 'MERCHANT'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
          <ThemedView className="flex-1 bg-slate-50 dark:bg-slate-950 px-4 pt-4">
            <View className="flex-row justify-between items-center mb-4">
              <ThemedText className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                Merchant Name
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close merchant selector"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="min-h-[44px] px-4 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 items-center justify-center active:opacity-75"
                onPress={closeModal}
              >
                <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">Done</ThemedText>
              </Pressable>
            </View>

          <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerClassName="pb-8">
            <TextInput
              className="h-12 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 text-base bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 mb-4"
              placeholder="e.g. Trader Joe's, Target, Uber..."
              placeholderTextColor="#94A3B8"
              value={draftMerchant}
              onChangeText={setDraftMerchant}
              autoFocus
              clearButtonMode="while-editing"
            />

            <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5">
              Recent Merchants (Tap to Pick)
            </ThemedText>

            <View className="flex-row flex-wrap gap-2">
              {recentMerchants.map((merchant) => (
                <Pressable
                  key={merchant}
                  accessibilityRole="button"
                  accessibilityLabel={`Select merchant ${merchant}`}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl border items-center justify-center active:scale-95 transition-all ${
                    draftMerchant === merchant
                      ? 'bg-brand-50 dark:bg-brand-950/60 border-brand-500'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                  }`}
                  onPress={() => setDraftMerchant(merchant)}
                >
                  <ThemedText
                    className={`text-xs ${
                      draftMerchant === merchant
                        ? 'font-bold text-brand-500'
                        : 'font-semibold text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {merchant}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            <View className="flex-row justify-end gap-3 mt-6">
              {value.merchant ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear merchant"
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 items-center justify-center active:opacity-75"
                  onPress={handleClearMerchant}
                >
                  <ThemedText className="text-xs font-bold text-rose-500">
                    Clear Merchant
                  </ThemedText>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save merchant"
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center shadow-md shadow-brand-500/25"
                onPress={() => handleSaveMerchant(draftMerchant)}
              >
                <ThemedText className="text-xs font-bold text-white">
                  Save Merchant
                </ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </ThemedView>
          </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>

      {/* ==================================================================== */}
      {/* MODAL 3: Tag Chips & Custom Tag */}
      {/* ==================================================================== */}
      <Modal
        visible={activeModal === 'TAGS'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
          <ThemedView className="flex-1 bg-slate-50 dark:bg-slate-950 px-4 pt-4">
            <View className="flex-row justify-between items-center mb-4">
              <ThemedText className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                Manage Tags
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close tags manager"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="min-h-[44px] px-4 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 items-center justify-center active:opacity-75"
                onPress={closeModal}
              >
                <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">Done</ThemedText>
              </Pressable>
            </View>

          <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerClassName="pb-8">
            {/* New tag input */}
            <View className="flex-row gap-2.5 items-center mb-4">
              <TextInput
                className="flex-1 h-12 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 text-base bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                placeholder="Add custom tag (e.g. coffee-run)"
                placeholderTextColor="#94A3B8"
                value={newTagInput}
                onChangeText={setNewTagInput}
                onSubmitEditing={handleAddNewTag}
                maxLength={32}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add custom tag"
                className={`h-12 px-4 rounded-2xl items-center justify-center active:scale-95 transition-all ${
                  newTagInput.trim()
                    ? 'bg-emerald-500 active:bg-emerald-600 shadow-md shadow-emerald-500/25'
                    : 'bg-slate-200 dark:bg-slate-800 opacity-60'
                }`}
                disabled={!newTagInput.trim()}
                onPress={handleAddNewTag}
              >
                <ThemedText
                  className={`text-xs font-bold ${
                    newTagInput.trim() ? 'text-white' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  Add #
                </ThemedText>
              </Pressable>
            </View>

            <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5">
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
                    className={`min-h-[44px] px-3.5 py-2 rounded-xl border items-center justify-center active:scale-95 transition-all ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                    }`}
                    onPress={() => handleToggleTag(tag)}
                  >
                    <ThemedText
                      className={`text-xs ${
                        isSelected
                          ? 'font-bold text-emerald-600 dark:text-emerald-400'
                          : 'font-semibold text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      #{tag} {isSelected ? '✓' : ''}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </ThemedView>
          </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>

      {/* ==================================================================== */}
      {/* MODAL 4: Note Editor */}
      {/* ==================================================================== */}
      <Modal
        visible={activeModal === 'NOTE'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
          <ThemedView className="flex-1 bg-slate-50 dark:bg-slate-950 px-4 pt-4">
            <View className="flex-row justify-between items-center mb-4">
              <ThemedText className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                Transaction Note
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close note editor"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="min-h-[44px] px-4 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 items-center justify-center active:opacity-75"
                onPress={closeModal}
              >
                <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">Done</ThemedText>
              </Pressable>
            </View>

          <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerClassName="pb-8">
            <TextInput
              className="h-32 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-base bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 mb-4"
              placeholder="Add details, reimbursement memo, or description..."
              placeholderTextColor="#94A3B8"
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
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 items-center justify-center active:opacity-75"
                  onPress={handleClearNote}
                >
                  <ThemedText className="text-xs font-bold text-rose-500">
                    Clear Note
                  </ThemedText>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save note"
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 active:bg-amber-600 items-center justify-center shadow-md shadow-amber-500/25"
                onPress={handleSaveNote}
              >
                <ThemedText className="text-xs font-bold text-white">
                  Save Note
                </ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </ThemedView>
          </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>

      {/* ==================================================================== */}
      {/* MODAL 5: Receipt Attachment */}
      {/* ==================================================================== */}
      <Modal
        visible={activeModal === 'RECEIPT'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
          <ThemedView className="flex-1 bg-slate-50 dark:bg-slate-950 px-4 pt-4">
            <View className="flex-row justify-between items-center mb-4">
              <ThemedText className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                Receipt Attachment
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close receipt attachment"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="min-h-[44px] px-4 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 items-center justify-center active:opacity-75"
                onPress={closeModal}
              >
                <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">Done</ThemedText>
              </Pressable>
            </View>

          <View className="flex-1">
            {value.receiptUri ? (
              <View className="rounded-2xl border border-purple-500/50 bg-white dark:bg-slate-900 p-4 items-center mb-4 gap-3">
                {value.receiptUri.startsWith('local://') ? (
                  <View className="items-center gap-1">
                    <ThemedText className="text-sm font-bold text-purple-600 dark:text-purple-400">
                      Sample Receipt Attached
                    </ThemedText>
                    <ThemedText className="text-xs text-slate-400 dark:text-slate-500" numberOfLines={1}>
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
                  accessibilityLabel="Remove receipt attachment"
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-500 active:bg-rose-600 items-center justify-center shadow-sm"
                  onPress={handleRemoveReceipt}
                >
                  <ThemedText className="text-xs font-bold text-white">
                    Remove Receipt
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}

            {receiptFeedback && (
              <ThemedText className="text-xs font-medium text-rose-500 mb-3">
                {receiptFeedback}
              </ThemedText>
            )}

            <View className="gap-2.5">
              <Pressable
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex-row justify-between items-center active:scale-[0.99] transition-all"
                onPress={handlePickFromLibrary}
              >
                <ThemedText className="text-base font-semibold text-slate-800 dark:text-slate-100">Choose Photo from Library</ThemedText>
                <ThemedText className="text-xs font-medium text-slate-400 dark:text-slate-500">
                  Select existing photo
                </ThemedText>
              </Pressable>

              <Pressable
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex-row justify-between items-center active:scale-[0.99] transition-all"
                onPress={handleTakePhoto}
              >
                <ThemedText className="text-base font-semibold text-slate-800 dark:text-slate-100">Take Photo with Camera</ThemedText>
                <ThemedText className="text-xs font-medium text-slate-400 dark:text-slate-500">
                  Capture receipt now
                </ThemedText>
              </Pressable>

              <Pressable
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex-row justify-between items-center active:scale-[0.99] transition-all"
                onPress={handleAttachDemoReceipt}
              >
                <ThemedText className="text-base font-semibold text-slate-800 dark:text-slate-100">Attach Sample Receipt (Demo)</ThemedText>
                <ThemedText className="text-xs font-medium text-slate-400 dark:text-slate-500">
                  Simulator / Web 1-tap test
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </ThemedView>
      </SafeAreaView>
    </Modal>
    </View>
  );
}
