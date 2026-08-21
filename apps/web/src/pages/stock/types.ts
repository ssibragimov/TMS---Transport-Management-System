import type {
  StockCategory,
  StockDocumentKind,
  StockIssuePurpose,
  StockMovementType,
  StockTracking,
  WarehouseKind,
} from '@gsm/shared';

/** Формы ответов складского API. Общие для страницы и её модальных окон. */

export interface StockItem {
  id: number;
  code: string;
  name: string;
  unit: string;
  category: StockCategory;
  tracking: StockTracking;
  catalogNumber: string | null;
  exchangeRequired: boolean;
  isActive: boolean;
  /** Остаток по всем складам офиса */
  onHand: string;
}

export interface StockWarehouse {
  id: number;
  code: string;
  name: string;
  kind: WarehouseKind;
  location: string | null;
  isActive: boolean;
  keeper: { id: number; fullName: string } | null;
  positions: number;
  totalValue: number;
}

export interface StockBalanceRow {
  id: number;
  quantity: string;
  minQuantity: string;
  avgPrice: string | null;
  part: StockItem;
  warehouse: { id: number; code: string; name: string; kind: WarehouseKind };
}

export interface StockMovementRow {
  id: number;
  type: StockMovementType;
  quantity: string;
  unitPrice: string | null;
  totalAmount: string | null;
  balanceAfter: string;
  movedAt: string;
  notes: string | null;
  part: { id: number; code: string; name: string; unit: string };
  warehouse: { id: number; code: string; name: string };
  document: {
    id: number;
    number: string;
    kind: StockDocumentKind;
    vehicle: { garageNumber: string } | null;
    recipientDriver: { lastName: string; firstName: string } | null;
    recipientUser: { fullName: string } | null;
  };
}

export interface StockDocumentRow {
  id: number;
  number: string;
  kind: StockDocumentKind;
  documentDate: string;
  externalNumber: string | null;
  totalAmount: string | null;
  purpose: StockIssuePurpose | null;
  reason: string | null;
  notes: string | null;
  warehouse: { id: number; code: string; name: string };
  targetWarehouse: { id: number; code: string; name: string } | null;
  supplier: { id: number; name: string } | null;
  vehicle: { id: number; garageNumber: string; plateNumber: string | null } | null;
  recipientDriver: {
    id: number;
    lastName: string;
    firstName: string;
    personnelNumber: string;
  } | null;
  recipientUser: { id: number; fullName: string } | null;
  _count: { movements: number };
}

export interface StockSummary {
  positions: number;
  totalValue: number;
  belowMin: number;
  utilizationQuantity: number;
  movementsToday: number;
}
