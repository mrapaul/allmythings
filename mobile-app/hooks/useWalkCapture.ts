import { checkShotQuality, dispatchShot } from '@/services/walk-capture';
import type { Prefs } from '@/stores/prefs';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

export interface ShotAdvice {
  uri: string;
  advice: string;
}

/**
 * Walk mode. The ONLY thing between the shutter and the next shot is the
 * on-device quality check (pure pixel math, no network). If the frame is
 * unusable the user hears about it instantly; otherwise detection is
 * dispatched immediately and the slow server precheck runs detached, its
 * verdict landing on the inbox card rather than interrupting the walk.
 */
export function useWalkCapture(prefs: Pick<Prefs, 'getPendingCaptures' | 'setPendingCaptures'>) {
  const router = useRouter();
  /** Precheck advice awaiting a decision (retake vs. send anyway). */
  const [shotAdvice, setShotAdvice] = useState<ShotAdvice | null>(null);
  /** Dispatches currently uploading (pre-job); drives the Sending… pill. */
  const [sendingCount, setSendingCount] = useState(0);

  const dispatch = async (imageUri: string) => {
    // Visible from the first millisecond of dispatch: the "Sending…" pill
    // holds the slot until either the processing toast (success) or the
    // inbox badge (failure) takes over. Never silence.
    setSendingCount((n) => n + 1);
    try {
      await dispatchShot(prefs as Prefs, imageUri);
    } finally {
      setSendingCount((n) => Math.max(0, n - 1));
    }
  };

  const captureAndDispatch = async (imageUri: string) => {
    const quality = await checkShotQuality(imageUri);
    if (quality?.advice) {
      setShotAdvice({ uri: imageUri, advice: quality.advice });
      return;
    }
    await dispatch(imageUri);
  };

  /** The user read the advice and wants the shot catalogued anyway. */
  const sendAnyway = () => {
    const shot = shotAdvice;
    setShotAdvice(null);
    if (shot) void dispatch(shot.uri);
  };

  const handleCamera = async () => {
    // Primary path: our own viewfinder, which coaches the frame BEFORE the
    // shutter (app/capture.tsx). It asks for camera permission itself.
    try {
      router.push('/capture');
      return;
    } catch {
      // The custom viewfinder needs expo-camera's native module; if that is
      // missing (e.g. a build predating the rebuild) fall through to the
      // system camera rather than stranding the button.
    }

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'One quick step',
        'Allow camera access in Settings and we can start photographing your things.',
      );
      return;
    }
    let uri: string | undefined;
    try {
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8 });
      uri = result.canceled ? undefined : result.assets?.[0]?.uri;
    } catch {
      // Simulators have no camera, and a real device's can be unavailable
      // (in use elsewhere, restricted by policy). Whatever the reason, a
      // button that silently does nothing is the worst possible answer.
      Alert.alert(
        'No camera available',
        'This device has no camera we can open — you can still add photos from your library.',
      );
      return;
    }
    if (uri) void captureAndDispatch(uri);
  };

  const handleLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'One quick step',
        'Allow photo access in Settings and we can catalogue shots you already have.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
    });
    const uri = result.canceled ? undefined : result.assets?.[0]?.uri;
    if (uri) void captureAndDispatch(uri);
  };

  const retake = () => {
    setShotAdvice(null);
    void handleCamera();
  };

  return { shotAdvice, sendingCount, handleCamera, handleLibrary, sendAnyway, retake };
}
