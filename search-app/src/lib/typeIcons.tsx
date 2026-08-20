import {
  Circle,
  Flame,
  Droplet,
  Zap,
  Leaf,
  Snowflake,
  Swords,
  Skull,
  Mountain,
  Wind,
  Brain,
  Bug,
  Gem,
  Ghost,
  Sparkles,
  Moon,
  Shield,
  Heart,
  type LucideIcon,
} from 'lucide-react';
import { TCG_TYPE_ALIASES } from './typeColors';

/** Icon per Pokemon type, paired with the color palette in typeColors.ts. */
const TYPE_ICONS: Record<string, LucideIcon> = {
  Normal: Circle,
  Fire: Flame,
  Water: Droplet,
  Electric: Zap,
  Grass: Leaf,
  Ice: Snowflake,
  Fighting: Swords,
  Poison: Skull,
  Ground: Mountain,
  Flying: Wind,
  Psychic: Brain,
  Bug: Bug,
  Rock: Gem,
  Ghost: Ghost,
  Dragon: Sparkles,
  Dark: Moon,
  Steel: Shield,
  Fairy: Heart,
};

export function typeIcon(type: string | undefined): LucideIcon {
  if (!type) return Circle;
  return TYPE_ICONS[TCG_TYPE_ALIASES[type] ?? type] ?? Circle;
}
