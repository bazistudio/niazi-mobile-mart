import React, { useState } from 'react';
import { MapPin, Phone, Mail, Clock, Send, CheckCircle2 } from 'lucide-react';

export const ContactPage: React.FC = () => {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 space-y-12">
      {/* Header */}
      <div className="text-center space-y-3">
        <span className="text-xs font-bold text-[#006970] uppercase tracking-wider">
          Get in Touch
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900">
          Contact Niazi Mobile Mart
        </h1>
        <p className="text-slate-600 max-w-xl mx-auto text-sm">
          Have a question about a phone model, need bulk pricing for mobile screens or batteries? Reach out today.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Contact Info Cards */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
            <h3 className="font-bold text-slate-900 text-base">Store Contact Information</h3>

            <div className="space-y-5 text-sm">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-[#00474c]/10 text-[#00474c]">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">Store Address</h4>
                  <p className="text-slate-600 text-xs mt-0.5 leading-relaxed">
                    Niazi Mobile Mart, Shop #12-14, Mobile Market Plaza, Pakistan
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-[#00474c]/10 text-[#00474c]">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">Phone & WhatsApp</h4>
                  <p className="text-slate-600 text-xs mt-0.5">
                    <a href="tel:+923000000000" className="hover:text-[#00474c] font-semibold">
                      +92 300 0000000
                    </a>
                  </p>
                  <p className="text-[11px] text-slate-400">Available 10:30 AM - 9:30 PM</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-[#00474c]/10 text-[#00474c]">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">Email Address</h4>
                  <p className="text-slate-600 text-xs mt-0.5">
                    <a href="mailto:info@niazimobilemart.com" className="hover:text-[#00474c]">
                      info@niazimobilemart.com
                    </a>
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-[#00474c]/10 text-[#00474c]">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">Business Hours</h4>
                  <p className="text-slate-600 text-xs mt-0.5">
                    Monday - Saturday: 10:30 AM – 9:30 PM
                  </p>
                  <p className="text-[11px] text-slate-400">Sunday: Closed / Emergency Dispatches</p>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <a
                href="https://wa.me/923000000000?text=Hello%20Niazi%20Mobile%20Mart,%20I%20have%20an%20inquiry"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-colors"
              >
                <Phone className="w-4 h-4" />
                Instant WhatsApp Message
              </a>
            </div>
          </div>
        </div>

        {/* Contact Form Placeholder */}
        <div className="lg:col-span-7 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm">
          <h3 className="font-bold text-slate-900 text-base mb-1">Send Us a Message</h3>
          <p className="text-xs text-slate-500 mb-6">
            Leave your name and requirements below. Our support team will get back to you promptly.
          </p>

          {submitted ? (
            <div className="p-8 text-center space-y-3 bg-emerald-50 rounded-2xl border border-emerald-200">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <h4 className="font-bold text-emerald-900 text-base">Message Received!</h4>
              <p className="text-xs text-emerald-700 max-w-sm mx-auto">
                Thank you for contacting Niazi Mobile Mart. Our team will review your inquiry and contact you shortly.
              </p>
              <button
                onClick={() => setSubmitted(false)}
                className="mt-2 text-xs font-semibold text-emerald-800 underline"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Your Name</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Imran Khan"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#00b4bb] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone / WhatsApp</label>
                  <input
                    required
                    type="tel"
                    placeholder="0300 1234567"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#00b4bb] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Interest / Department</label>
                <select className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#00b4bb]">
                  <option value="phones">New Smartphone Purchase</option>
                  <option value="tabs">Samsung Galaxy Tablet</option>
                  <option value="lcd">LCD / AMOLED Screen Replacement</option>
                  <option value="battery">Battery / Charging Port Flex</option>
                  <option value="wholesale">Technician Wholesale Inquiry</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Your Message</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Describe what product or spare part you are looking for..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#00b4bb] focus:bg-white"
                />
              </div>

              <button
                type="submit"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#00474c] hover:bg-[#00383c] text-white text-xs font-bold shadow-md transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit Inquiry</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
