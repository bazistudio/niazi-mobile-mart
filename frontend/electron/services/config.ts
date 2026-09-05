import Store from 'electron-store';

export interface AppConfig {
  backupPath: string;
  lastBackupDate: string;
  autoBackupEnabled: boolean;
}

const defaultConfig: AppConfig = {
  backupPath: '',
  lastBackupDate: '',
  autoBackupEnabled: true
};

export const configStore = new Store<AppConfig>({
  name: 'tijarat-config',
  defaults: defaultConfig
});
