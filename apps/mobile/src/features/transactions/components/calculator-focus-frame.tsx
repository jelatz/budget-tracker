import React, { forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';

import {
  getCalculatorFrameClassName,
  type CalculatorFocusFrameHandle,
  type CalculatorFocusFrameProps,
} from './calculator-frame-theme';

export type {
  CalculatorFocusFrameHandle,
  CalculatorFocusFrameProps,
} from './calculator-frame-theme';

export const CalculatorFocusFrame = forwardRef<
  CalculatorFocusFrameHandle,
  CalculatorFocusFrameProps
>(function CalculatorFocusFrame(
  {
    transactionType,
    isFocused,
    onFocusChange,
    children,
  },
  ref,
) {
  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        onFocusChange(true);
      },
    }),
    [onFocusChange],
  );

  return (
    <View
      onTouchStart={() => onFocusChange(true)}
      className={getCalculatorFrameClassName(transactionType, isFocused)}
    >
      {children}
    </View>
  );
});
