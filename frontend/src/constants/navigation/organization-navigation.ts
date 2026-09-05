import { 
  Building, 
  Store, 
  Users, 
  Settings, 
  Activity, 
  PieChart,
  Truck,
  Shield,
  TrendingUp,
  Receipt,
  FileBarChart,
  Package,
  ArrowRightLeft,
  AlertTriangle,
  History,
  Bell,
  CreditCard,
  Sliders,
  Wallet
} from 'lucide-react';
import { PERMISSIONS } from '../permissions';

export const organizationNavigation = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard', href: '/dashboard/organization', icon: Building, permission: PERMISSIONS.ORG_VIEW },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Shops', href: '/dashboard/organization/shops', icon: Store, permission: PERMISSIONS.SHOPS_VIEW_ALL },
    ],
  },
  {
    label: 'People',
    items: [
      { name: 'Employees', href: '/dashboard/organization/staff', icon: Users, permission: PERMISSIONS.USERS_VIEW },
    ],
  },
  {
    label: 'Activity',
    items: [
      { name: 'Audit Logs', href: '/dashboard/organization/audit-logs', icon: Activity, permission: PERMISSIONS.ORG_SETTINGS_MANAGE },
    ],
  },
  {
    label: 'Settings',
    items: [
      { name: 'Organization Profile', href: '/dashboard/organization/settings', icon: Settings, permission: PERMISSIONS.ORG_SETTINGS_MANAGE },
    ],
  },
];

