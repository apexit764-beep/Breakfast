export type Restaurant = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

export type MenuItem = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  price: number | null;
  is_available: boolean;
  created_at: string;
};

export type DailySelection = {
  id: string;
  restaurant_id: string;
  selection_date: string;
  created_at: string;
};

export type Order = {
  id: string;
  employee_name: string;
  restaurant_id: string;
  order_date: string;
  notes: string | null;
  created_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  created_at: string;
};
