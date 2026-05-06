import { Repo } from '@/db/repository';
import { makeTestDb } from '@/db/test-helpers';
import { Prefs } from '@/stores/prefs';
import { act, render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import { HomesProvider, useHomes } from './HomesContext';

describe('HomesContext', () => {
  it('seeds a default home on first launch', async () => {
    const repo = new Repo(makeTestDb());
    const prefs = Prefs.makeInMemory();

    let api: ReturnType<typeof useHomes> | undefined;
    function Capture() {
      api = useHomes();
      return null;
    }

    render(
      <HomesProvider repo={repo} prefs={prefs}>
        <Capture />
      </HomesProvider>,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(api?.isLoading).toBe(false);
    expect(api?.homes).toHaveLength(1);
    expect(api?.activeHomeId).toBeTruthy();
  });
});
