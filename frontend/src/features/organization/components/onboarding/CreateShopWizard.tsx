import React, { useState } from 'react';
import { createOrganizationShop } from '@/lib/api/organization.api';
import { Store, MapPin, CheckCircle, Loader2 } from 'lucide-react';

interface WizardProps {
  organizationId: string;
  onSuccess: () => void;
}

export const CreateShopWizard: React.FC<WizardProps> = ({ organizationId, onSuccess }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    city: ''
  });

  const handleNext = () => {
    if (step === 1 && (!formData.name || !formData.phone)) {
      setError("Please fill required fields");
      return;
    }
    setError(null);
    setStep(prev => prev + 1);
  };

  const handleBack = () => {
    setStep(prev => prev - 1);
    setError(null);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);
      await createOrganizationShop(organizationId, formData);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to create shop');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden mt-10 border border-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-white text-center">
        <h2 className="text-2xl font-bold mb-2">Create Your First Shop</h2>
        <p className="text-blue-100">Your organization is ready. Let's set up your first location to start business operations.</p>
      </div>

      {/* Progress */}
      <div className="flex justify-center items-center py-6 border-b border-gray-100 bg-gray-50">
        <div className={`flex items-center ${step >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold mr-2">1</div>
          <span className="font-medium hidden sm:inline">Basic Info</span>
        </div>
        <div className={`w-12 h-1 mx-4 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
        <div className={`flex items-center ${step >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold mr-2">2</div>
          <span className="font-medium hidden sm:inline">Location</span>
        </div>
        <div className={`w-12 h-1 mx-4 ${step >= 3 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
        <div className={`flex items-center ${step >= 3 ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold mr-2">3</div>
          <span className="font-medium hidden sm:inline">Confirm</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-center">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center mb-6 text-gray-800">
              <Store className="mr-3 text-blue-600" />
              <h3 className="text-xl font-semibold">Shop Information</h3>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shop Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow"
                placeholder="e.g., Mobile Zone Saddar"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow"
                placeholder="e.g., 0300 1234567"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center mb-6 text-gray-800">
              <MapPin className="mr-3 text-blue-600" />
              <h3 className="text-xl font-semibold">Location Details</h3>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={e => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow"
                placeholder="e.g., Rawalpindi"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Address</label>
              <textarea
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow h-24 resize-none"
                placeholder="e.g., Shop #12, First Floor, City Center"
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center mb-6 text-gray-800">
              <CheckCircle className="mr-3 text-blue-600" />
              <h3 className="text-xl font-semibold">Ready to Create</h3>
            </div>
            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
              <h4 className="text-sm font-medium text-gray-500 uppercase mb-4 tracking-wider">Summary</h4>
              <div className="space-y-3">
                <div className="flex border-b border-gray-200 pb-2">
                  <span className="text-gray-500 w-1/3">Shop Name</span>
                  <span className="text-gray-900 font-medium">{formData.name}</span>
                </div>
                <div className="flex border-b border-gray-200 pb-2">
                  <span className="text-gray-500 w-1/3">Phone</span>
                  <span className="text-gray-900 font-medium">{formData.phone}</span>
                </div>
                <div className="flex border-b border-gray-200 pb-2">
                  <span className="text-gray-500 w-1/3">City</span>
                  <span className="text-gray-900 font-medium">{formData.city || '-'}</span>
                </div>
                <div className="flex">
                  <span className="text-gray-500 w-1/3">Address</span>
                  <span className="text-gray-900 font-medium">{formData.address || '-'}</span>
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-500 italic text-center">
              A default branch will be created automatically. You can manage employees and inventory after creation.
            </p>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-10 flex justify-between pt-6 border-t border-gray-100">
          {step > 1 ? (
            <button
              onClick={handleBack}
              disabled={loading}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            >
              Back
            </button>
          ) : (
            <div></div> // Spacer
          )}

          {step < 3 ? (
            <button
              onClick={handleNext}
              className="px-8 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors"
            >
              Next Step
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-8 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium shadow-sm transition-colors flex items-center disabled:opacity-70"
            >
              {loading && <Loader2 className="animate-spin mr-2 h-5 w-5" />}
              {loading ? 'Creating...' : 'Create Shop'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
