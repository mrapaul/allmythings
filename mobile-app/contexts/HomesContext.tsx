import type { Repo } from '@/db/repository';
import type { Prefs } from '@/stores/prefs';
import type { Home, Profile } from '@/types/inventory';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

interface HomesContextValue {
  homes: Home[];
  activeHomeId: string | null;
  activeHome: Home | null;
  profile: Profile;
  setActiveHomeId: (id: string) => Promise<void>;
  addHome: (name: string, icon: string) => Promise<Home>;
  renameHome: (id: string, name: string, icon: string) => Promise<void>;
  deleteHome: (id: string) => Promise<void>;
  updateProfile: (profile: Profile) => Promise<void>;
  isLoading: boolean;
}

const HomesContext = createContext<HomesContextValue | undefined>(undefined);
const DEFAULT_PROFILE: Profile = { name: 'You', initials: 'Y' };

interface ProviderProps {
  repo: Repo;
  prefs: Prefs;
  children: ReactNode;
}

export function HomesProvider({ repo, prefs, children }: ProviderProps) {
  const [homes, setHomes] = useState<Home[]>([]);
  const [activeHomeId, setActiveHomeIdState] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      let current = await repo.listHomes();
      if (current.length === 0) {
        const seed = await repo.addHome({ name: 'My Home', icon: '🏡' });
        current = [seed];
        prefs.setActiveHomeId(seed.id);
      }
      setHomes(current);

      const stored = prefs.getActiveHomeId();
      const active =
        stored && current.some((h) => h.id === stored) ? stored : (current[0]?.id ?? null);
      setActiveHomeIdState(active);
      if (active) prefs.setActiveHomeId(active);

      const p = prefs.getProfile();
      if (p) setProfile(p);

      setIsLoading(false);
    })();
  }, [repo, prefs]);

  const setActiveHomeId: HomesContextValue['setActiveHomeId'] = async (id) => {
    setActiveHomeIdState(id);
    prefs.setActiveHomeId(id);
  };

  const addHome: HomesContextValue['addHome'] = async (name, icon) => {
    const h = await repo.addHome({ name, icon });
    setHomes((prev) => [...prev, h]);
    await setActiveHomeId(h.id);
    return h;
  };

  const renameHome: HomesContextValue['renameHome'] = async (id, name, icon) => {
    await repo.renameHome(id, name, icon);
    setHomes((prev) =>
      prev.map((h) =>
        h.id === id ? { ...h, name: name.trim() || h.name, icon: icon || h.icon } : h,
      ),
    );
  };

  const deleteHome: HomesContextValue['deleteHome'] = async (id) => {
    if (homes.length <= 1) return;
    await repo.deleteHome(id);
    const next = homes.filter((h) => h.id !== id);
    setHomes(next);
    if (activeHomeId === id) {
      const fallback = next[0];
      if (fallback) await setActiveHomeId(fallback.id);
    }
  };

  const updateProfile: HomesContextValue['updateProfile'] = async (next) => {
    setProfile(next);
    prefs.setProfile(next);
  };

  const activeHome = useMemo(
    () => homes.find((h) => h.id === activeHomeId) ?? null,
    [homes, activeHomeId],
  );

  return (
    <HomesContext.Provider
      value={{
        homes,
        activeHomeId,
        activeHome,
        profile,
        setActiveHomeId,
        addHome,
        renameHome,
        deleteHome,
        updateProfile,
        isLoading,
      }}
    >
      {children}
    </HomesContext.Provider>
  );
}

export function useHomes(): HomesContextValue {
  const v = useContext(HomesContext);
  if (!v) throw new Error('useHomes outside HomesProvider');
  return v;
}
