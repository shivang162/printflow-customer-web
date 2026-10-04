import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { orderService, shopService } from '@printflow/shared';
import confetti from 'canvas-confetti';

const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'txt', 'tiff'];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB limit

export default function CustomerUploadPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { shopId: urlShopId, shopCode } = useParams();
  const [searchParams] = useSearchParams();
  const targetShopId = shopCode || urlShopId || searchParams.get('shop') || 'printflow-demo';

  const path = location.pathname;

  const [shop, setShop] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [instructions, setInstructions] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [failedFiles, setFailedFiles] = useState([]);
  const [uploadStep, setUploadStep] = useState('FORM'); // 'FORM' | 'UPLOADING' | 'SUCCESS' | 'ERROR'
  const [overallProgress, setOverallProgress] = useState(0);
  const [fileProgressList, setFileProgressList] = useState([]);
  const [completedOrder, setCompletedOrder] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  const fileInputRef = useRef(null);

  // Load shop information
  useEffect(() => {
    shopService.getShopByCode(targetShopId).then((s) => {
      if (s) setShop(s);
    });
  }, [targetShopId]);

  // Sync state if navigation comes with direct URL
  useEffect(() => {
    if (path.endsWith('/progress')) {
      if (uploadStep === 'FORM' && selectedFiles.length === 0) {
        navigate(`/s/${targetShopId}`, { replace: true });
      }
    } else if (path.endsWith('/success')) {
      if (uploadStep !== 'SUCCESS' && !completedOrder) {
        navigate(`/s/${targetShopId}`, { replace: true });
      }
    } else if (path.endsWith('/error')) {
      if (uploadStep !== 'ERROR' && failedFiles.length === 0) {
        setUploadStep('ERROR');
        setFailedFiles([
          {
            name: 'Upload Notice',
            size: '-',
            reason: 'No recent upload failure. Select your files below to begin printing.'
          }
        ]);
      }
    } else if (path.endsWith('/upload') || path === `/s/${targetShopId}` || path === '/') {
      if (uploadStep !== 'FORM' && uploadStep !== 'UPLOADING') {
        setUploadStep('FORM');
      }
    }
  }, [path, targetShopId]);

  // Handle file additions
  const handleFilesChosen = (fileList) => {
    const filesArray = Array.from(fileList);
    const valid = [];
    const invalid = [];

    filesArray.forEach((file) => {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        invalid.push({
          name: file.name,
          size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
          reason: 'File type not supported. Use PDF, DOCX, or JPG.'
        });
      } else if (file.size > MAX_FILE_SIZE_BYTES) {
        invalid.push({
          name: file.name,
          size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
          reason: 'File exceeds maximum size (50 MB limit)'
        });
      } else {
        const fileObj = {
          rawFile: file,
          name: file.name,
          size: file.size,
          sizeFormatted:
            file.size > 1024 * 1024
              ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
              : `${Math.round(file.size / 1024)} KB`,
          type: file.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg'),
          pages: ext === 'pdf' ? 2 : 1,
          dataUrl: null
        };
        valid.push(fileObj);
      }
    });

    if (invalid.length > 0) {
      setFailedFiles(invalid);
      if (valid.length === 0) {
        setUploadStep('ERROR');
        return;
      }
    }

    setSelectedFiles((prev) => [...prev, ...valid]);
    setFormErrors((prev) => ({ ...prev, files: undefined }));
  };

  const removeFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const totalSizeFormatted = () => {
    const totalBytes = selectedFiles.reduce((acc, f) => acc + (f.size || 0), 0);
    return totalBytes > 1024 * 1024
      ? `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(totalBytes / 1024)} KB`;
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesChosen(e.dataTransfer.files);
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!customerName.trim()) {
      errors.name = 'Please enter your full name';
    }
    if (!phone.trim()) {
      errors.phone = 'Please enter your mobile number';
    } else if (phone.replace(/\D/g, '').length < 8) {
      errors.phone = 'Please enter a valid mobile phone number';
    }
    if (selectedFiles.length === 0) {
      errors.files = 'Please select at least one document or image to print';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const startUpload = async () => {
    if (!validateForm()) return;

    setUploadStep('UPLOADING');
    navigate(`/s/${targetShopId}/progress`);
    setOverallProgress(15);

    const initialList = selectedFiles.map((f, i) => ({
      name: f.name,
      sizeFormatted: f.sizeFormatted,
      status: i === 0 ? 'uploading' : 'queued',
      progress: i === 0 ? 30 : 0
    }));
    setFileProgressList(initialList);

    let currentPercent = 20;
    const progressTimer = setInterval(() => {
      currentPercent = Math.min(currentPercent + 15, 90);
      setOverallProgress(currentPercent);
      const activeIdx = Math.min(
        Math.floor((currentPercent / 100) * selectedFiles.length),
        selectedFiles.length - 1
      );
      setFileProgressList(
        selectedFiles.map((f, idx) => {
          if (idx < activeIdx) {
            return { name: f.name, sizeFormatted: f.sizeFormatted, status: 'ready', progress: 100 };
          } else if (idx === activeIdx) {
            return {
              name: f.name,
              sizeFormatted: f.sizeFormatted,
              status: 'uploading',
              progress: currentPercent
            };
          } else {
            return { name: f.name, sizeFormatted: f.sizeFormatted, status: 'queued', progress: 0 };
          }
        })
      );
    }, 200);

    try {
      const order = await orderService.submitOrder({
        customerName,
        phone,
        instructions,
        files: selectedFiles,
        shopId: targetShopId
      });

      clearInterval(progressTimer);
      setOverallProgress(100);

      setFileProgressList(
        selectedFiles.map((f) => ({
          name: f.name,
          sizeFormatted: f.sizeFormatted,
          status: 'ready',
          progress: 100
        }))
      );

      setCompletedOrder(order);

      setTimeout(() => {
        setUploadStep('SUCCESS');
        navigate(`/s/${targetShopId}/success`, { replace: true });
        try {
          confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.6 }
          });
        } catch {}
      }, 500);
    } catch (err) {
      clearInterval(progressTimer);
      console.error('Upload failed:', err);
      setFailedFiles([
        {
          name: 'File Upload Transmission',
          size: totalSizeFormatted(),
          reason:
            err.message ||
            'Could not upload files to print shop. Please check your network connection and try again.'
        }
      ]);
      setUploadStep('ERROR');
      navigate(`/s/${targetShopId}/error`, { replace: true });
    }
  };

  const resetForm = () => {
    setSelectedFiles([]);
    setFailedFiles([]);
    setUploadStep('FORM');
    setOverallProgress(0);
    setFileProgressList([]);
    setCompletedOrder(null);
    setFormErrors({});
    navigate(`/s/${targetShopId}`, { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#111827] font-sans flex flex-col selection:bg-blue-600 selection:text-white">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <span className="material-symbols-outlined text-[22px]">print</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight">
                  PrintFlow
                </span>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Customer Upload
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                {shop?.name
                  ? `${shop.name} • Instant digital document dispatch`
                  : 'Instant in-store digital document dispatch'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Shop Open</span>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-6xl mx-auto w-full p-4 sm:p-6 lg:p-8">
        {/* ============================================================== */}
        {/* STATE 1 & 2: FORM / FILES SELECTED                             */}
        {/* ============================================================== */}
        {uploadStep === 'FORM' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* LEFT COLUMN: UPLOAD DROPZONE & FORM INPUTS (7 COLS) */}
            <div className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Upload documents to print
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Files are transmitted directly to the store printer queue. No app or account needed.
                </p>
              </div>

              {/* HIDDEN FILE INPUT */}
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt,.tiff"
                onChange={(e) => {
                  if (e.target.files) handleFilesChosen(e.target.files);
                }}
                className="hidden"
              />

              {/* DRAG AND DROP ZONE */}
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition cursor-pointer group ${
                  formErrors.files
                    ? 'border-red-400 bg-red-50/30'
                    : 'border-blue-500/80 bg-blue-50/40 hover:bg-blue-50/70'
                }`}
              >
                <div className="w-14 h-14 mx-auto rounded-2xl bg-white shadow-md flex items-center justify-center text-blue-600 group-hover:scale-105 transition">
                  <span className="material-symbols-outlined text-[32px]">cloud_upload</span>
                </div>
                <p className="text-sm sm:text-base font-bold text-slate-900 mt-3">
                  Choose files or drag and drop here
                </p>
                <p className="text-xs text-slate-500 mt-1">Tap to browse files from your device</p>

                <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-2 px-3 py-1 bg-white rounded-full border border-blue-100 text-[11px] text-slate-500 shadow-2xs">
                  <span>PDF, DOCX, JPG, PNG, TXT</span>
                  <span>•</span>
                  <span className="font-semibold text-blue-600">Multiple files supported (Max 50MB)</span>
                </div>
              </div>

              {formErrors.files && (
                <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">error</span>
                  {formErrors.files}
                </p>
              )}

              {/* FILES SELECTED LIST */}
              {selectedFiles.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Selected Files</h3>
                      <p className="text-xs text-blue-600 font-semibold">
                        {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} ({totalSizeFormatted()} total)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedFiles([])}
                      className="text-xs font-bold text-slate-400 hover:text-red-500 transition"
                    >
                      Clear all
                    </button>
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                    {selectedFiles.map((file, idx) => {
                      const isPdf = file.name.endsWith('.pdf');
                      const isImage = file.name.match(/\.(jpg|jpeg|png)$/i);
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-2xl border border-slate-200 bg-white shadow-xs flex items-center justify-between group hover:border-blue-300 transition"
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                                isPdf
                                  ? 'bg-red-50 text-red-600 border-red-100'
                                  : isImage
                                  ? 'bg-amber-50 text-amber-600 border-amber-100'
                                  : 'bg-blue-50 text-blue-600 border-blue-100'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[20px]">
                                {isPdf ? 'description' : isImage ? 'image' : 'article'}
                              </span>
                            </div>
                            <div className="truncate">
                              <p className="text-xs font-bold text-slate-900 truncate">{file.name}</p>
                              <p className="text-[10px] text-slate-400 font-medium">
                                {isPdf ? 'PDF' : isImage ? 'Image' : 'Document'} · {file.sizeFormatted}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFile(idx)}
                            className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition"
                            title="Remove file"
                          >
                            <span className="material-symbols-outlined text-base">close</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 hover:border-blue-400 text-slate-600 hover:text-blue-600 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <span className="material-symbols-outlined text-sm">add_circle</span>
                    Add more files
                  </button>
                </div>
              )}

              {/* CUSTOMER DETAILS FORM */}
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Rahul Sharma"
                      value={customerName}
                      onChange={(e) => {
                        setCustomerName(e.target.value);
                        setFormErrors((prev) => ({ ...prev, name: undefined }));
                      }}
                      className={`w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600 transition ${
                        formErrors.name ? 'border-red-400' : 'border-slate-200'
                      }`}
                    />
                    {formErrors.name && (
                      <p className="text-[11px] text-red-500 mt-1">{formErrors.name}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Mobile Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setFormErrors((prev) => ({ ...prev, phone: undefined }));
                      }}
                      className={`w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600 transition ${
                        formErrors.phone ? 'border-red-400' : 'border-slate-200'
                      }`}
                    />
                    {formErrors.phone && (
                      <p className="text-[11px] text-red-500 mt-1">{formErrors.phone}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Printing Instructions <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2 color copies, A4, single-sided"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600 transition"
                  />
                </div>
              </div>

              {/* PRIMARY ACTION CTA */}
              <button
                type="button"
                onClick={startUpload}
                className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-xs sm:text-sm uppercase tracking-wider shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 transition"
              >
                <span>SEND FILES TO PRINTER</span>
                <span className="material-symbols-outlined text-base">send</span>
              </button>

              <p className="text-[11px] text-center text-slate-400">
                🔒 No account or mobile app installation required. Files are cleared after print.
              </p>
            </div>

            {/* RIGHT COLUMN: HOW IT WORKS & ZERO RETENTION GUARANTEE (5 COLS) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm space-y-5">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-600 text-base">info</span>
                  HOW IT WORKS
                </h2>

                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-extrabold text-xs flex items-center justify-center shrink-0">
                      1
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Select your files</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Attach PDFs, homework, photos, or documents directly from your phone.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-extrabold text-xs flex items-center justify-center shrink-0">
                      2
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Add your details</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Provide your name and any specific print requirements.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-extrabold text-xs flex items-center justify-center shrink-0">
                      3
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Send</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Fast encrypted transfer straight to the print shop queue.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-extrabold text-xs flex items-center justify-center shrink-0">
                      4
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Collect your prints</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Pay at the counter and pick up your documents when ready.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* PRIVACY GUARANTEE */}
              <div className="p-5 rounded-3xl bg-slate-50 border border-slate-200 text-slate-600 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <span className="material-symbols-outlined text-base text-blue-600">verified_user</span>
                  <span>Zero Retention Guarantee</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Your documents are strictly temporary. Files are queued for printing and automatically purged from the store cache once printed.
                </p>
              </div>

              {/* STATION INFO */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-600 text-sm">storefront</span>
                  <span>{shop?.name || 'Counter Station • Apex Hub'}</span>
                </div>
                <span className="font-mono text-[10px] text-emerald-600 font-bold">● CONNECTED</span>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* STATE 3: UPLOAD PROGRESS                                       */}
        {/* ============================================================== */}
        {uploadStep === 'UPLOADING' && (
          <div className="max-w-md mx-auto bg-white rounded-3xl p-6 sm:p-8 shadow-md border border-slate-200 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white">
                  <span className="material-symbols-outlined text-lg">print</span>
                </div>
                <span className="font-bold text-slate-900 text-sm">PrintFlow Dispatch</span>
              </div>
              <span className="text-xs font-mono text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded">
                {overallProgress}%
              </span>
            </div>

            <div>
              <h2 className="text-xl font-extrabold text-slate-900">Uploading your files...</h2>
              <p className="text-xs text-slate-500 mt-1">Please keep this page open while we send your files.</p>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-100">
              <div className="flex justify-between items-center text-xs font-bold text-slate-800 mb-2">
                <span>Overall Progress</span>
                <span className="text-blue-600">
                  {fileProgressList.filter((f) => f.status === 'ready').length} of {fileProgressList.length} files uploaded
                </span>
              </div>
              <div className="w-full h-3 bg-blue-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2 font-mono">
                <span>Speed: Direct Cloud</span>
                <span>~ {Math.max(1, Math.round((100 - overallProgress) / 25))} sec remaining</span>
              </div>
            </div>

            <div className="space-y-2.5">
              {fileProgressList.map((item, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-2xl border shadow-2xs flex items-center justify-between ${
                    item.status === 'ready'
                      ? 'border-emerald-200 bg-white'
                      : item.status === 'uploading'
                      ? 'border-blue-300 bg-blue-50/30'
                      : 'border-slate-200 bg-slate-50/50 opacity-80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                        item.status === 'ready'
                          ? 'bg-emerald-100 text-emerald-600'
                          : item.status === 'uploading'
                          ? 'bg-blue-100 text-blue-600'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {item.status === 'ready' ? (
                        <span className="material-symbols-outlined text-base">check</span>
                      ) : item.status === 'uploading' ? (
                        <span className="material-symbols-outlined text-base animate-spin">sync</span>
                      ) : (
                        <span className="material-symbols-outlined text-sm">hourglass_top</span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 truncate max-w-[170px]">{item.name}</p>
                      <p
                        className={`text-[10px] font-semibold ${
                          item.status === 'ready'
                            ? 'text-emerald-600'
                            : item.status === 'uploading'
                            ? 'text-blue-600'
                            : 'text-slate-400'
                        }`}
                      >
                        {item.status === 'ready'
                          ? `✓ Uploaded · ${item.sizeFormatted}`
                          : item.status === 'uploading'
                          ? `● Uploading ${item.progress}%...`
                          : '○ Waiting in queue...'}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      item.status === 'ready'
                        ? 'text-emerald-600 bg-emerald-50'
                        : item.status === 'uploading'
                        ? 'text-blue-600 bg-blue-50'
                        : 'text-slate-400 bg-slate-100'
                    }`}
                  >
                    {item.status === 'ready' ? 'Ready' : item.status === 'uploading' ? 'In transit' : 'Queued'}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-100 text-slate-600 text-[10px]">
              <span className="material-symbols-outlined text-sm text-slate-400">lock</span>
              <span>256-bit encrypted transfer to print shop terminal.</span>
            </div>

            <button
              type="button"
              onClick={resetForm}
              className="w-full py-2.5 rounded-xl text-slate-400 hover:text-slate-600 font-bold text-xs tracking-wider uppercase transition"
            >
              Cancel Upload
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* STATE 4: SUCCESS                                               */}
        {/* ============================================================== */}
        {uploadStep === 'SUCCESS' && completedOrder && (
          <div className="max-w-md mx-auto bg-white rounded-3xl p-6 sm:p-8 shadow-md border border-slate-200 text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-md shadow-emerald-500/15">
              <span className="material-symbols-outlined text-[36px] font-bold">check</span>
            </div>

            <div>
              <h2 className="text-xl font-extrabold text-slate-900 leading-tight">Files sent successfully</h2>
              <p className="text-xs text-slate-500 mt-1">Your documents have been received by the print shop.</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-2.5 text-xs shadow-2xs">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200/80">
                <span className="text-slate-500 font-medium">Order ID</span>
                <span className="font-bold text-blue-600 font-mono">#{completedOrder.id}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Customer</span>
                <span className="font-bold text-slate-900">{completedOrder.customerName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Files</span>
                <span className="font-bold text-slate-900">
                  {completedOrder.files.length} file{completedOrder.files.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Submitted</span>
                <span className="font-mono text-slate-700">
                  {new Date(completedOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {completedOrder.instructions && (
                <div className="flex justify-between items-start pt-1 border-t border-slate-200/60">
                  <span className="text-slate-500 font-medium">Instructions</span>
                  <span className="font-medium text-slate-800 text-right max-w-[180px] truncate">
                    {completedOrder.instructions}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                <span className="text-slate-500 font-medium">Status</span>
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[11px]">
                  <span className="material-symbols-outlined text-xs">verified</span> Received by shop
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200 text-left flex items-start gap-3">
              <span className="material-symbols-outlined text-blue-600 text-xl shrink-0 mt-0.5">storefront</span>
              <p className="text-xs text-blue-900 font-medium leading-relaxed">
                Please collect your printed documents from the counter. Inform the operator of your name:{' '}
                <strong className="text-slate-900 underline">{completedOrder.customerName}</strong> or Order{' '}
                <strong className="text-blue-700">#{completedOrder.id}</strong>.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs tracking-wider uppercase shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">task_alt</span>
                DONE
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs tracking-wider uppercase transition"
              >
                SEND MORE FILES
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* STATE 5: ERROR STATE                                           */}
        {/* ============================================================== */}
        {uploadStep === 'ERROR' && (
          <div className="max-w-md mx-auto bg-white rounded-3xl p-6 sm:p-8 shadow-md border border-slate-200 space-y-5">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-wider mb-2">
                <span className="material-symbols-outlined text-xs">warning</span> Action Needed
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 leading-tight">Some files couldn't be uploaded</h2>
              <p className="text-xs text-slate-500 mt-1">Check the files below and try again.</p>
            </div>

            <div className="space-y-2.5">
              {failedFiles.map((err, idx) => (
                <div key={idx} className="p-3 rounded-2xl border border-red-200 bg-red-50/40 space-y-1">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-red-100 text-red-600 flex items-center justify-center font-bold text-xs">
                        ✕
                      </span>
                      <span className="text-xs font-bold text-slate-900 truncate max-w-[200px]">{err.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-red-600 font-semibold">{err.size}</span>
                  </div>
                  <p className="text-[11px] text-red-700 font-medium pl-8">{err.reason}</p>
                </div>
              ))}

              {selectedFiles.length > 0 && (
                <div className="p-3 rounded-2xl border border-emerald-200 bg-emerald-50/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-600 text-base">check_circle</span>
                    <span className="text-xs font-medium text-slate-700">
                      {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} ready to send
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-700 font-bold">{totalSizeFormatted()}</span>
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
              <p className="font-bold text-slate-800">Supported formats:</p>
              <p className="text-[10px] text-slate-500">
                PDF, Word (DOC/DOCX), Images (JPEG, PNG, TIFF) up to 50MB per file.
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  fileInputRef.current?.click();
                }}
                className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs tracking-wider uppercase shadow-lg shadow-blue-500/25 transition"
              >
                TRY AGAIN
              </button>
              <button
                type="button"
                onClick={() => {
                  setFailedFiles([]);
                  if (selectedFiles.length > 0) {
                    setUploadStep('FORM');
                  } else {
                    resetForm();
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs tracking-wider uppercase transition"
              >
                REMOVE FAILED FILES
              </button>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-200 py-4 px-4 sm:px-6 text-xs text-slate-400 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-700">PRINTFLOW</span>
            <span>•</span>
            <span>Customer File-Upload Terminal</span>
          </div>
          <div className="text-[11px] text-slate-500">
            Strict customer-facing flow • Zero retention policy • End-to-end encrypted
          </div>
        </div>
      </footer>
    </div>
  );
}
