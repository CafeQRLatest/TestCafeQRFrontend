import React from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import ModuleGate from '../../components/ModuleGate';
import DocumentViewerPopup from '../../components/purchasing/DocumentViewerPopup';
import { formatTzDate } from '../../utils/timezoneUtils';

// All credit settlements resources live inside components/CreditCustomers/
import useCreditSettlements from '../../components/CreditCustomers/useCreditSettlements';
import CreditCustomerHeader from '../../components/CreditCustomers/CreditCustomerHeader';
import CreditCustomerKPIs from '../../components/CreditCustomers/CreditCustomerKPIs';
import CreditCustomerToolbar from '../../components/CreditCustomers/CreditCustomerToolbar';
import CreditCustomerTable from '../../components/CreditCustomers/CreditCustomerTable';
import CreditVendorTable from '../../components/CreditCustomers/CreditVendorTable';
import CustomerFormModal from '../../components/CreditCustomers/CustomerFormModal';
import VendorFormModal from '../../components/CreditCustomers/VendorFormModal';
import PaymentModal from '../../components/CreditCustomers/PaymentModal';
import VendorPaymentModal from '../../components/CreditCustomers/VendorPaymentModal';
import creditCustomersStyles from '../../components/CreditCustomers/creditCustomersStyles';

const STATUS_CFG = {
  DRAFT:     { label: 'Draft',     color: '#64748b', bg: '#f1f5f9', dot: '#94a3b8', border: '#cbd5e1' },
  BILLED:    { label: 'Billed',    color: '#b45309', bg: '#fffbeb', dot: '#f59e0b', border: '#fde68a' },
  COMPLETED: { label: 'Completed', color: '#059669', bg: '#ecfdf5', dot: '#10b981', border: '#6ee7b7' },
  PAID:      { label: 'Paid',      color: '#059669', bg: '#ecfdf5', dot: '#10b981', border: '#6ee7b7' },
  CANCELLED: { label: 'Cancelled', color: '#dc2626', bg: '#fef2f2', dot: '#ef4444', border: '#fca5a5' },
};

function CreditSettlementsContent() {
  const {
    mode,
    setMode,
    purchaseEnabled,
    config,
    timezone,
    SYM,
    money,
    loading,
    search,
    setSearch,
    activeTab,
    setActiveTab,
    viewingDoc,
    setViewingDoc,
    handleViewOrder,
    handleViewPayment,

    // Customer state
    customers,
    customerTotals,
    customerFormOpen,
    setCustomerFormOpen,
    editingCustomer,
    customerForm,
    setCustomerForm,
    savingCustomer,
    paymentCustomer,
    setPaymentCustomer,
    paymentInvoice,
    setPaymentInvoice,
    paymentAmount,
    setPaymentAmount,
    paymentMethod,
    setPaymentMethod,
    manualAllocations,
    setManualAllocations,
    expandedCustomer,
    ordersByCustomer,
    paymentsByCustomer,
    openCustomerForm,
    saveCustomer,
    toggleCustomerStatus,
    openCustomerPayment,
    submitCustomerPayment,
    toggleCustomerOrders,

    // Vendor state
    vendors,
    vendorTotals,
    vendorFormOpen,
    setVendorFormOpen,
    editingVendor,
    vendorForm,
    setVendorForm,
    savingVendor,
    paymentVendor,
    setPaymentVendor,
    vendorPaymentOrder,
    setVendorPaymentOrder,
    vendorPaymentAmount,
    setVendorPaymentAmount,
    vendorPaymentMethod,
    setVendorPaymentMethod,
    vendorPaymentNotes,
    setVendorPaymentNotes,
    vendorManualAllocations,
    setVendorManualAllocations,
    expandedVendor,
    ordersByVendor,
    paymentsByVendor,
    openVendorForm,
    saveVendor,
    toggleVendorStatus,
    openVendorPayment,
    submitVendorPayment,
    toggleVendorOrders,
  } = useCreditSettlements();

  const isVendor = purchaseEnabled && mode === 'vendors';

  return (
    <DashboardLayout title="Credit Settlements" hideTitle={true}>
      <div className="rpt-page credit-page">

        {/* Top Header with Slider Switch */}
        <CreditCustomerHeader 
          mode={mode}
          onModeChange={setMode}
          onNewCustomer={() => openCustomerForm()}
          onNewVendor={() => openVendorForm()}
          showVendors={purchaseEnabled}
        />

        {/* Dynamic KPI Cards */}
        <CreditCustomerKPIs
          mode={mode}
          totals={isVendor ? vendorTotals : customerTotals}
          allocationMode={config?.creditAllocationMode}
          money={money}
        />

        {/* Search Toolbar */}
        <CreditCustomerToolbar
          search={search}
          onSearchChange={setSearch}
          onSearchClear={() => setSearch('')}
          placeholder={isVendor ? "Search vendor by name, phone, or GSTIN..." : "Search customer by name or phone..."}
        />

        {/* Table View: Customer or Vendor */}
        {loading ? (
          <div className="rpt-loading">
            <div className="spinner" />
            <span>Loading {isVendor ? 'credit vendors' : 'credit customers'} data...</span>
          </div>
        ) : isVendor ? (
          <CreditVendorTable
            vendors={vendors}
            expandedVendor={expandedVendor}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            ordersByVendor={ordersByVendor}
            paymentsByVendor={paymentsByVendor}
            timezone={timezone}
            money={money}
            openPayment={openVendorPayment}
            toggleOrders={toggleVendorOrders}
            toggleStatus={toggleVendorStatus}
            openForm={openVendorForm}
            handleViewOrder={handleViewOrder}
            handleViewPayment={handleViewPayment}
          />
        ) : (
          <CreditCustomerTable
            customers={customers}
            expandedCustomer={expandedCustomer}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            ordersByCustomer={ordersByCustomer}
            paymentsByCustomer={paymentsByCustomer}
            timezone={timezone}
            money={money}
            openPayment={openCustomerPayment}
            toggleOrders={toggleCustomerOrders}
            toggleStatus={toggleCustomerStatus}
            openForm={openCustomerForm}
            handleViewOrder={handleViewOrder}
            handleViewPayment={handleViewPayment}
          />
        )}

        {/* Customer Modals */}
        <CustomerFormModal
          open={customerFormOpen}
          editing={editingCustomer}
          form={customerForm}
          setForm={setCustomerForm}
          saving={savingCustomer}
          saveCustomer={saveCustomer}
          setFormOpen={setCustomerFormOpen}
          SYM={SYM}
        />

        <PaymentModal
          customer={paymentCustomer}
          invoice={paymentInvoice}
          amount={paymentAmount}
          setAmount={setPaymentAmount}
          method={paymentMethod}
          setMethod={setPaymentMethod}
          manualAllocations={manualAllocations}
          setManualAllocations={setManualAllocations}
          config={config}
          submitPayment={submitCustomerPayment}
          onClose={() => { setPaymentCustomer(null); setPaymentInvoice(null); }}
          money={money}
          SYM={SYM}
        />

        {/* Vendor Modals */}
        <VendorFormModal
          open={vendorFormOpen}
          editing={editingVendor}
          form={vendorForm}
          setForm={setVendorForm}
          saving={savingVendor}
          saveVendor={saveVendor}
          setFormOpen={setVendorFormOpen}
          SYM={SYM}
        />

        <VendorPaymentModal
          vendor={paymentVendor}
          order={vendorPaymentOrder}
          amount={vendorPaymentAmount}
          setAmount={setVendorPaymentAmount}
          method={vendorPaymentMethod}
          setMethod={setVendorPaymentMethod}
          notes={vendorPaymentNotes}
          setNotes={setVendorPaymentNotes}
          manualAllocations={vendorManualAllocations}
          setManualAllocations={setVendorManualAllocations}
          config={config}
          submitPayment={submitVendorPayment}
          onClose={() => { setPaymentVendor(null); setVendorPaymentOrder(null); }}
          money={money}
          SYM={SYM}
          saving={savingVendor}
        />

        {/* Document Viewer Popup */}
        {viewingDoc && (
          <DocumentViewerPopup
            order={viewingDoc.order}
            docType={viewingDoc.type}
            vendors={[]}
            warehouses={[]}
            timezone={timezone || 'Asia/Kolkata'}
            currencySymbol={SYM}
            formatTzDate={formatTzDate}
            onClose={() => setViewingDoc(null)}
            onViewLinked={(order, type) => setViewingDoc({ order, type })}
            STATUS_CFG={STATUS_CFG}
          />
        )}
      </div>

      <style jsx global>{creditCustomersStyles}</style>
    </DashboardLayout>
  );
}

export default function CreditSettlementsPage() {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF']} requiredMenu="Credit Settlements">
      <ModuleGate>
        <CreditSettlementsContent />
      </ModuleGate>
    </RoleGate>
  );
}
