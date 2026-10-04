import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import CustomerUploadPage from './pages/customer/UploadPage';

/**
 * Backward compatibility handler:
 * Automatically converts legacy hash URLs (e.g. /#/s/printflow-demo) into clean HTML5 paths (/s/printflow-demo).
 */
function LegacyHashRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (window.location.hash && window.location.hash.startsWith('#/')) {
      const cleanPath = window.location.hash.replace(/^#/, '');
      navigate(cleanPath, { replace: true });
    }
  }, [location, navigate]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <LegacyHashRedirect />
      <Routes>
        {/* ROOT: Defaults to demo shop upload */}
        <Route path="/" element={<Navigate to="/s/printflow-demo" replace />} />

        {/* CUSTOMER SHOP ROUTES */}
        <Route path="/s/:shopCode" element={<CustomerUploadPage />} />
        <Route path="/s/:shopCode/upload" element={<CustomerUploadPage />} />
        <Route path="/s/:shopCode/progress" element={<CustomerUploadPage />} />
        <Route path="/s/:shopCode/success" element={<CustomerUploadPage />} />
        <Route path="/s/:shopCode/error" element={<CustomerUploadPage />} />

        {/* COMPATIBILITY FALLBACKS */}
        <Route path="/upload" element={<CustomerUploadPage />} />
        <Route path="/upload/progress" element={<CustomerUploadPage />} />
        <Route path="/upload/success" element={<CustomerUploadPage />} />
        <Route path="/upload/error" element={<CustomerUploadPage />} />
        <Route path="/shop/:shopId" element={<CustomerUploadPage />} />

        {/* CATCH-ALL: Safe SPA fallback */}
        <Route path="*" element={<Navigate to="/s/printflow-demo" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
