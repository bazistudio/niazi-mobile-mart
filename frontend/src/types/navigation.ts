import { LucideIcon } from "lucide-react";

export interface NavigationItem {
  name: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
}

export interface NavigationGroup {
  label?: string;
  items: NavigationItem[];
}
