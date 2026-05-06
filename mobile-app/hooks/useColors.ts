import { Colors } from '@/constants/colors';
import { useColorScheme } from 'react-native';

export type Scheme = 'light' | 'dark';

export function resolveColors(scheme: Scheme) {
  return scheme === 'dark' ? Colors.dark : Colors.light;
}

export function useColors() {
  const scheme = (useColorScheme() ?? 'light') as Scheme;
  return resolveColors(scheme);
}
