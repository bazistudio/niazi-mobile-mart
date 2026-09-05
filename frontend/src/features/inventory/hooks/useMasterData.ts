import { useCategories } from './useCategories';
import { useBrands } from './useBrands';
import { useCompanies } from './useCompanies';
import { useColors } from './useColors';
import { useQualities } from './useQualities';

export type MasterEntity = 'category' | 'brand' | 'company' | 'color' | 'quality';

export const useMasterData = (entity: MasterEntity) => {
  const categoryHook = useCategories({ enabled: entity === 'category' });
  const brandHook = useBrands({ enabled: entity === 'brand' });
  const companyHook = useCompanies({ enabled: entity === 'company' });
  const colorHook = useColors({ enabled: entity === 'color' });
  const qualityHook = useQualities({ enabled: entity === 'quality' });

  switch (entity) {
    case 'category':
      return {
        options: categoryHook.categories,
        isLoading: categoryHook.isLoading,
        createOption: categoryHook.createCategory,
        isCreating: categoryHook.isCreating,
        updateOption: categoryHook.updateCategory,
        isUpdating: categoryHook.isUpdating,
        deleteOption: categoryHook.deleteCategory,
        isDeleting: categoryHook.isDeleting,
      };
    case 'brand':
      return {
        options: brandHook.brands,
        isLoading: brandHook.isLoading,
        createOption: brandHook.createBrand,
        isCreating: brandHook.isCreating,
        updateOption: brandHook.updateBrand,
        isUpdating: brandHook.isUpdating,
        deleteOption: brandHook.deleteBrand,
        isDeleting: brandHook.isDeleting,
      };
    case 'company':
      return {
        options: companyHook.companies,
        isLoading: companyHook.isLoading,
        createOption: companyHook.createCompany,
        isCreating: companyHook.isCreating,
        updateOption: companyHook.updateCompany,
        isUpdating: companyHook.isUpdating,
        deleteOption: companyHook.deleteCompany,
        isDeleting: companyHook.isDeleting,
      };
    case 'color':
      return {
        options: colorHook.colors,
        isLoading: colorHook.isLoading,
        createOption: colorHook.createColor,
        isCreating: colorHook.isCreating,
        updateOption: colorHook.updateColor,
        isUpdating: colorHook.isUpdating,
        deleteOption: colorHook.deleteColor,
        isDeleting: colorHook.isDeleting,
      };
    case 'quality':
      return {
        options: qualityHook.qualities,
        isLoading: qualityHook.isLoading,
        createOption: qualityHook.createQuality,
        isCreating: qualityHook.isCreating,
        updateOption: qualityHook.updateQuality,
        isUpdating: qualityHook.isUpdating,
        deleteOption: qualityHook.deleteQuality,
        isDeleting: qualityHook.isDeleting,
      };
    default:
      return {
        options: [],
        isLoading: false,
        createOption: async () => {},
        isCreating: false,
        updateOption: async () => {},
        isUpdating: false,
        deleteOption: async () => {},
        isDeleting: false,
      };
  }
};
