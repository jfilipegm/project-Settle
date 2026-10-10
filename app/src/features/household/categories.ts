import {
  IconBolt,
  IconBus,
  IconConfetti,
  IconDots,
  IconKey,
  IconShoppingCart,
  IconSofa,
  IconToolsKitchen2,
  IconWifi,
  type Icon as TablerIcon,
} from '@tabler/icons-react'
import type { CategoryId } from './model.ts'

/** Each category's icon (M4 plan, H8), always shown beside its name. */
export const CATEGORY_ICONS: Record<CategoryId, TablerIcon> = {
  groceries: IconShoppingCart,
  eatingOut: IconToolsKitchen2,
  rent: IconKey,
  utilities: IconBolt,
  internet: IconWifi,
  household: IconSofa,
  transport: IconBus,
  leisure: IconConfetti,
  other: IconDots,
}
