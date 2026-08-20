import { ClassicFacet } from '@/components/ClassicFacet';
import { VaultGenerationFacet } from '@/components/vault/VaultGenerationFacet';
import { VaultDexRangeFacet } from '@/components/vault/VaultDexRangeFacet';
import { vaultTypeFacet, vaultWeaknessFacet, vaultAbilityFacet, vaultGenerationFacet, vaultDexFacet } from '@/vaultControllers';

export function VaultFacetsList() {
  return (
    <div className="space-y-3">
      <ClassicFacet controller={vaultTypeFacet} label="Type" withTypeIcons />
      <ClassicFacet controller={vaultWeaknessFacet} label="Weakness" />
      <ClassicFacet controller={vaultAbilityFacet} label="Ability" withSearch />
      <VaultGenerationFacet controller={vaultGenerationFacet} />
      <VaultDexRangeFacet controller={vaultDexFacet} />
    </div>
  );
}
