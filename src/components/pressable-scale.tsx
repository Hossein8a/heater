// src/components/pressable-scale.tsx
// -------------------------------------------------------------
// Qartal — Animated pressable with spring scale + dim feedback.
// Use it wherever a plain Pressable would feel static (chips,
// buttons, tiles). Wraps children in an Animated.View so the
// whole content scales together.
// -------------------------------------------------------------
import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

interface PressableScaleProps extends PressableProps {
  style?: StyleProp<ViewStyle>;
  /** ضریب کوچک‌شدن هنگام لمس — پیش‌فرض ۰.۹۶ */
  pressScale?: number;
}

const PRESS_SPRING = { damping: 16, stiffness: 340, mass: 0.7 };
const RELEASE_SPRING = { damping: 14, stiffness: 240, mass: 0.8 };

export function PressableScale({
  children,
  style,
  pressScale = 0.96,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const dim = useSharedValue(0);

  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: 1 - dim.value,
  }));

  return (
    <Pressable
      disabled={disabled}
      onPressIn={(e) => {
        if (!disabled) {
          scale.value = withSpring(pressScale, PRESS_SPRING);
          dim.value = withTiming(0.08, { duration: 80 });
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, RELEASE_SPRING);
        dim.value = withTiming(0, { duration: 140 });
        onPressOut?.(e);
      }}
      {...rest}
    >
      <Animated.View style={[anim, style]}>{children as React.ReactNode}</Animated.View>
    </Pressable>
  );
}
