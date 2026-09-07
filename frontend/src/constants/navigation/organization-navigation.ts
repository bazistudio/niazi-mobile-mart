import { 
  LayoutDashboard,
  Store, 
  Users, 
  Activity,
  BarChart3,
  History,
  Briefcase,
  BookOpen,
  LineChart,
  Share2,
  Package,
  UserCheck,
  Truck,
  Contact2,
  Settings
} from 'lucide-react';
import { NavigationGroup } from '../../types/navigation';

export const organizationNavigation: NavigationGroup[] = [
  {
    items: [
      { name: 'Dashboard', href: '/dashboard/organization', icon: LayoutDashboard },
      { name: 'Shops', href: '/dashboard/organization/shops', icon: Store },
      { name: 'Employees', href: '/dashboard/organization/employees', icon: Users },
      { name: 'Audit Log', href: '/dashboard/organization/audit-logs', icon: Activity },
      { name: 'Reports', href: '/dashboard/organization/reports', icon: BarChart3 },
      { name: 'History', href: '/dashboard/organization/history', icon: History },
      { name: 'Business', href: '/dashboard/organization/business', icon: Briefcase },
      { name: 'Ledger', href: '/dashboard/organization/ledger', icon: BookOpen },
      { name: 'Analytics', href: '/dashboard/organization/analytics', icon: LineChart },
      { name: 'Social', href: '/dashboard/organization/social', icon: Share2 },
      { name: 'Products', href: '/dashboard/organization/products', icon: Package },
      { name: 'Customers', href: '/dashboard/organization/customers', icon: UserCheck },
      { name: 'Suppliers', href: '/dashboard/organization/suppliers', icon: Truck },
      { name: 'Parties', href: '/dashboard/organization/parties', icon: Contact2 },
      { name: 'Settings', href: '/dashboard/organization/settings', icon: Settings },
    ],
  },
];

export default organizationNavigation;
