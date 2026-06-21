import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import RoleGate from '../../components/RoleGate';
import NiceSelect from '../../components/NiceSelect';
import api from '../../utils/api';
import { 
  FaCheckCircle, FaExclamationCircle, FaUserCircle, FaChevronRight,
  FaSearch, FaSave, FaPowerOff, FaStore, FaMicrochip, FaEnvelope, FaPhone,
  FaUserPlus, FaShieldAlt, FaUserTag, FaUsers
} from 'react-icons/fa';

const getRequestErrorMessage = (err, fallback = 'Request failed') => {
  const data = err?.response?.data;
  const message = data?.message || data?.error || err?.message || fallback;
  return data?.errorReference ? `${message} (ref ${data.errorReference})` : message;
};

export default function UsersManagementPage() {
  return (
    <RoleGate allowedRoles={['ADMIN', 'SUPER_ADMIN']} requiredMenu="Organization">
      <UsersContent />
    </RoleGate>
  );
}

function UsersContent() {
  const { logout, userRole } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('users'); // 'users' or 'roles'
  const [message, setMessage] = useState(null);
  const [msgType, setMsgType] = useState('success');

  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [menus, setMenus] = useState([]);
  const [config, setConfig] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Frontend RBAC Hierarchy
  const ROLE_RANKS = {
    'SUPER_ADMIN': 100,
    'ROLE_SUPER_ADMIN': 100,
    'ADMIN': 80,
    'ROLE_ADMIN': 80,
    'MANAGER': 50,
    'ROLE_MANAGER': 50,
    'STAFF': 10,
    'ROLE_STAFF': 10
  };
  const getRank = (roleName) => ROLE_RANKS[roleName?.toUpperCase()] || 0;
  const currentUserRank = getRank(userRole);
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'ROLE_SUPER_ADMIN' || userRole === 'ROLE_ADMIN';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (currentSelection = null) => {
    try {
      const [uResp, rResp, oResp, tResp, pResp, cResp] = await Promise.all([
        api.get('/api/v1/users'),
        api.get('/api/v1/roles'),
        api.get('/api/v1/organizations'),
        api.get('/api/v1/terminals'),
        api.get('/api/v1/roles/menus'),
        api.get('/api/v1/configurations')
      ]);
      
      if (cResp?.data?.success) {
        setConfig(cResp.data.data);
      }
      
      if (uResp.data.success) {
        setUsers(uResp.data.data || []);
      }
      
      if (rResp.data.success) {
        setRoles(rResp.data.data || []);
      }

      if (oResp.data.success) {
        setOrgs(oResp.data.data || []);
      }
      if (tResp.data.success) {
        setTerminals(tResp.data.data || []);
      }
      if (pResp.data.success) {
        const uniqueMenus = [];
        const seenNames = new Set();
        (pResp.data.data || [])
          .filter(m => !m.parentId) // Only show Parent menus in the Role Mapping UI
          .forEach(m => {
            if (!seenNames.has(m.name)) {
              // Filter out Table Management if disabled
              if (m.name === "Table Management" && cResp?.data?.data?.tableManagementEnabled === false) return;
              
              seenNames.add(m.name);
              uniqueMenus.push(m);
            }
          });
        setMenus(uniqueMenus);
      }

      const rawUsers = uResp.data.data || [];
      const rawRoles = rResp.data.data || [];

      // Selection logic
      if (rawUsers.length > 0 && !selectedUser && !currentSelection) {
        setSelectedUser({ ...rawUsers[0], password: '' });
      } else if (currentSelection && activeTab === 'users') {
        setSelectedUser({ ...currentSelection, password: '' });
      }

      if (rawRoles.length > 0 && !selectedRole && !currentSelection) {
        setSelectedRole(rawRoles[0]);
      } else if (currentSelection && activeTab === 'roles') {
        setSelectedRole(currentSelection);
      }

    } catch (err) {
      console.error("Failed to load management data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!isAdmin) return;
    
    // Validate mandatory fields
    const missingFields = [];
    if (!selectedUser.firstName?.trim()) missingFields.push("First Name");
    if (!selectedUser.lastName?.trim()) missingFields.push("Last Name");
    if (!selectedUser.email?.trim()) missingFields.push("Email");
    if (!selectedUser.roleId && !selectedUser.roleEntity?.id) missingFields.push("Auth Role");
    
    // Allow orgId to be '0' string or number 0 for Global Access
    const hasOrg = selectedUser.orgId !== undefined && selectedUser.orgId !== null && selectedUser.orgId !== '';
    const hasEntityOrg = selectedUser.organization?.id !== undefined && selectedUser.organization?.id !== null;
    if (!hasOrg && !hasEntityOrg && selectedUser.orgId !== 0 && selectedUser.orgId !== '0') {
      missingFields.push("Branch");
    }

    if (missingFields.length > 0) {
      setMsgType('error');
      setMessage(`Missing mandatory fields: ${missingFields.join(', ')}`);
      return;
    }

    const isNew = !selectedUser.id;

    // RBAC Security Validation: Prevent Privilege Escalation
    const targetRoleObj = roles.find(r => r.id === (selectedUser.roleId || selectedUser.roleEntity?.id));
    if (targetRoleObj && currentUserRank < 100 && getRank(targetRoleObj.name) >= currentUserRank) {
       setMsgType('error');
       setMessage("Privilege Escalation Blocked: You cannot assign a role equal to or higher than your own.");
       return;
    }
    
    if (!isNew && currentUserRank < 100) {
       const originalRank = getRank(selectedUser.roleEntity?.name);
       if (originalRank >= currentUserRank) {
          setMsgType('error');
          setMessage("Privilege Escalation Blocked: You cannot edit a user whose rank is equal to or higher than your own.");
          return;
       }
    }

    if (isNew && !selectedUser.password?.trim()) {
      setMsgType('error');
      setMessage("Password is required for new staff accounts.");
      return;
    }

    setSaving(true);
    setMessage(null);
    
    const url = isNew ? '/api/v1/users' : `/api/v1/users/${selectedUser.id}`;
    
    try {
      const payload = {
        ...selectedUser,
        firstName: selectedUser.firstName.trim(),
        lastName: selectedUser.lastName.trim(),
        email: selectedUser.email.trim()
      };
      if (isNew) {
        payload.password = selectedUser.password.trim();
      }
      
      // If password field is empty during an update, don't send it to backend
      if (!isNew && (!payload.password || payload.password.trim() === '')) {
        delete payload.password;
      }

      // Handle Global Branch access ("0") for backend UUID parsing
      if (payload.orgId === '0' || payload.orgId === 0 || payload.orgId === '') {
        payload.orgId = null;
      }
      
      // Prevent Jackson 500 error on empty string UUID fields
      if (payload.terminalId === '') payload.terminalId = null;
      if (payload.roleId === '') payload.roleId = null;

      // Map role to standard JPA relation entity gracefully
      const finalRoleId = payload.roleId || payload.roleEntity?.id;
      if (finalRoleId) {
        payload.roleEntity = { id: finalRoleId };
      } else {
        payload.roleEntity = null;
      }
      
      delete payload.roleId;

      delete payload.organization;
      delete payload.terminal;
      delete payload.authorities;
      delete payload.username;

      const resp = await (isNew ? api.post(url, payload) : api.put(url, payload));
      
      if (resp.data.success) {
        setMsgType('success');
        setMessage(isNew ? "Staff provisioned!" : "Staff updated!");
        fetchData(resp.data.data);
      } else {
        throw new Error(resp.data.message || "Transaction failed");
      }
    } catch (err) {
      setMsgType('error');
      setMessage(getRequestErrorMessage(err, "Failed to save staff account"));
    } finally {
      setSaving(false);
    }
  };

  const startNewUser = () => {
    if (!isAdmin) return;
    setSelectedUser({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      phone: '',
      roleId: roles.length > 0 ? roles[0].id : '',
      orgId: '',
      terminalId: '',
      isactive: 'Y'
    });
  };



  const handleSaveRole = async (e) => {
    if (e) e.preventDefault();
    if (!isAdmin) return;

    // RBAC Validation
    if (currentUserRank < 100 && getRank(selectedRole.name) >= currentUserRank) {
       setMsgType('error');
       setMessage("Privilege Escalation Blocked: You cannot modify a role equal to or higher than your own.");
       return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const resp = await api.post('/api/v1/roles', selectedRole);
      if (resp.data.success) {
        setMsgType('success');
        setMessage("Role permissions updated!");
        fetchData(resp.data.data);
      } else {
        throw new Error(resp.data.message || "Failed to update role");
      }
    } catch (err) {
      setMsgType('error');
      setMessage(err.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleMenu = (menu) => {
    if (!isAdmin) return;
    const currentMenus = [...(selectedRole.menus || [])];
    const index = currentMenus.findIndex(m => m.id === menu.id);
    if (index > -1) {
      currentMenus.splice(index, 1);
    } else {
      currentMenus.push(menu);
    }
    setSelectedRole({ ...selectedRole, menus: currentMenus });
  };

  const startNewRole = () => {
    if (!isAdmin) return;
    setSelectedRole({
      name: '',
      description: '',
      menus: [],
      isactive: 'Y'
    });
  };

  if (loading) return <div className="loading-state-premium"><span>Syncing Identity Network...</span></div>;

  return (
    <DashboardLayout title="Staff & Permissions" showBack={true}>
      <div className="v2-layout-container">
        {/* Navigation Rail */}
        <aside className="v2-sidebar">
          <div className="tab-switcher-modern">
            <button className={activeTab === 'users' ? 'active' : ''} onClick={() => {setActiveTab('users'); setSearchTerm('');}}>Staff</button>
            <button className={activeTab === 'roles' ? 'active' : ''} onClick={() => {setActiveTab('roles'); setSearchTerm('');}}>Roles</button>
          </div>

          <div className="sidebar-action-header">
            <h3>{activeTab === 'users' ? "Staff Members" : "Static Roles"}</h3>
            {activeTab === 'users' && isAdmin && (
              <button className="v2-add-btn" onClick={startNewUser} title="Provision Staff">
                <FaUserPlus />
              </button>
            )}
          </div>

          <div className="sidebar-search-box">
             <FaSearch className="search-icon" />
             <input 
               type="text" 
               placeholder={`Search ${activeTab}...`}
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>

          <div className="v2-branch-grid">
            {activeTab === 'users' ? (
              users
                .filter(u => {
                  const targetRank = getRank(u.roleEntity?.name);
                  if (currentUserRank < 100 && targetRank >= currentUserRank) return false;
                  
                  const search = searchTerm.toLowerCase();
                  return u.firstName.toLowerCase().includes(search) || 
                         u.lastName.toLowerCase().includes(search) ||
                         u.email.toLowerCase().includes(search) ||
                         (u.roleEntity?.name || '').toLowerCase().includes(search);
                })
                .map(u => (
                  <div 
                    key={u.id} 
                    className={`v2-branch-card ${selectedUser?.id === u.id ? 'selected' : ''}`}
                    onClick={() => setSelectedUser({ ...u, password: '' })}
                  >
                    <div className="card-status-pip" data-status={u.isactive}></div>
                    <div className="card-info">
                      <span className="card-title">{u.firstName} {u.lastName}</span>
                      <span className="card-code">{u.email}</span>
                      <div className="card-tag-row">
                        <span className="branch-tag">{u.roleEntity?.name || 'STAFF'}</span>
                      </div>
                    </div>
                    <FaChevronRight className="card-chevron" />
                  </div>
                ))
            ) : (
              roles
                .filter(r => {
                  if (currentUserRank < 100 && getRank(r.name) >= currentUserRank) return false;
                  return r.name.toLowerCase().includes(searchTerm.toLowerCase());
                })
                .map(r => (
                  <div 
                    key={r.id} 
                    className={`v2-branch-card ${selectedRole?.id === r.id ? 'selected' : ''}`}
                    onClick={() => setSelectedRole(r)}
                  >
                    <div className="card-status-pip" data-status={r.isactive}></div>
                    <div className="card-info">
                      <span className="card-title">{r.name}</span>
                      <span className="card-code">{r.menus?.length || 0} Menus Assigned</span>
                    </div>
                    <FaChevronRight className="card-chevron" />
                  </div>
                ))
            )}
          </div>
        </aside>

        {/* Dynamic Workspace */}
        <main className="v2-workspace">
          {activeTab === 'users' ? (
            selectedUser ? (
              <div className="v2-form-container">
                <div className="v2-hero-card">
                  <div className="hero-identity">
                    <div className="hero-icon-box"><FaUserCircle /></div>
                    <div className="hero-text">
                      <h2>{selectedUser.id ? `${selectedUser.firstName} ${selectedUser.lastName}` : "Provision Staff Account"}</h2>
                      <p>{selectedUser.id ? `Staff ID: ${selectedUser.id.slice(0, 8)}` : "Configure authentication and access details"}</p>
                    </div>
                  </div>
                  <div className="hero-actions">
                     <div className={`v2-status-pill ${selectedUser.isactive === 'Y' ? 'active' : 'inactive'}`} 
                          onClick={() => {
                            if (!isAdmin) return;
                            setSelectedUser({...selectedUser, isactive: selectedUser.isactive === 'Y' ? 'N' : 'Y'})
                          }}>
                       <FaPowerOff /> {selectedUser.isactive === 'Y' ? "Active" : "Inactive"}
                     </div>
                     {isAdmin && (
                       <button onClick={handleSave} disabled={saving} className="v2-prime-save">
                         {saving ? "SAVING..." : <><FaSave /> Save Staff</>}
                       </button>
                     )}
                  </div>
                </div>

                <div className="v2-detail-grid">
                  <section className="v2-data-block">
                    <div className="block-header">
                      <FaShieldAlt className="block-icon" />
                      <h4>Identity & Authentication</h4>
                    </div>
                    <div className="block-content">
                      <div className="v2-input-group">
                        <label>First Name <span className="req">*</span></label>
                        <input type="text" readOnly={!isAdmin} value={selectedUser.firstName} onChange={(e) => setSelectedUser({...selectedUser, firstName: e.target.value})} placeholder="John" required />
                      </div>
                      <div className="v2-input-group">
                        <label>Last Name <span className="req">*</span></label>
                        <input type="text" readOnly={!isAdmin} value={selectedUser.lastName} onChange={(e) => setSelectedUser({...selectedUser, lastName: e.target.value})} placeholder="Doe" required />
                      </div>
                      <div className="v2-input-group">
                        <label>Official Email (Login) <span className="req">*</span></label>
                        <input type="email" readOnly={!isAdmin} value={selectedUser.email} onChange={(e) => setSelectedUser({...selectedUser, email: e.target.value})} placeholder="john@example.com" required />
                      </div>
                      <div className="v2-input-group">
                        <label>{!selectedUser.id ? <><span className="req">*</span> Initial Password</> : 'Set New Password (Optional)'}</label>
                        <input type="password" readOnly={!isAdmin} value={selectedUser.password || ''} onChange={(e) => setSelectedUser({...selectedUser, password: e.target.value})} placeholder="••••••••" required={!selectedUser.id} />
                      </div>
                    </div>
                  </section>

                  <section className="v2-data-block">
                    <div className="block-header">
                      <FaUserTag className="block-icon" />
                      <h4>Access & Assignment</h4>
                    </div>
                    <div className="block-content">
                      <div className="v2-input-group">
                        <label>Staff Role <span className="req">*</span></label>
                        <NiceSelect 
                          disabled={!isAdmin || (currentUserRank < 100 && getRank(selectedUser.roleEntity?.name) >= currentUserRank)}
                          options={roles
                            .filter(r => currentUserRank >= 100 || getRank(r.name) < currentUserRank)
                            .map(r => ({ value: r.id, label: r.name }))}
                          value={selectedUser.roleId || (selectedUser.roleEntity?.id)}
                          onChange={(val) => setSelectedUser({...selectedUser, roleId: val})}
                        />
                      </div>
                      <div className="v2-input-group">
                        <label>Primary Branch <span className="req">*</span></label>
                        <NiceSelect 
                          disabled={!isAdmin}
                          options={[
                            { value: '', label: 'Select Branch...' },
                            { value: '0', label: 'Global / Enterprise Access (Client Level)' },
                            ...orgs.map(o => ({ value: o.id, label: o.name }))
                          ]}
                          value={selectedUser.orgId || (selectedUser.organization?.id) || ''}
                          onChange={(val) => setSelectedUser({...selectedUser, orgId: val})}
                        />
                      </div>
                      <div className="v2-input-group">
                        <label>Linked Terminal (Optional)</label>
                        <NiceSelect 
                          disabled={!isAdmin}
                          options={[
                            { value: '', label: 'No Specific Terminal' },
                            ...terminals
                              // Filter terminals by selected orgId (branch), or show all if Global ('0' or null)
                              .filter(t => !selectedUser.orgId || selectedUser.orgId === '0' || t.orgId === selectedUser.orgId)
                              .map(t => ({ value: t.id, label: t.name }))
                          ]}
                          value={selectedUser.terminalId || (selectedUser.terminal?.id) || ''}
                          onChange={(val) => setSelectedUser({...selectedUser, terminalId: val})}
                        />
                      </div>
                      <div className="v2-input-group">
                        <label>Contact Phone</label>
                        <input type="tel" readOnly={!isAdmin} value={selectedUser.phone} onChange={(e) => setSelectedUser({...selectedUser, phone: e.target.value})} placeholder="+1 234 567 890" />
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            ) : (
              <div className="v2-empty-state">
                <div className="empty-symbol"><FaUsers /></div>
                <h2>Identify Authentication Scanned</h2>
                <p>Select a staff member from the left panel to manage permissions or provision a new team account.</p>
              </div>
            )
          ) : (
            selectedRole ? (
              <div className="v2-form-container">
                <div className="v2-hero-card">
                  <div className="hero-identity">
                    <div className="hero-icon-box"><FaShieldAlt /></div>
                    <div className="hero-text">
                      <h2>{selectedRole.id ? selectedRole.name : "Create New Authority Profile"}</h2>
                      <p>{selectedRole.id ? `Role Profile: ${selectedRole.id.slice(0, 8)}` : "Define role name and map granular permissions"}</p>
                    </div>
                  </div>
                  <div className="hero-actions">
                     {isAdmin && (
                       <button onClick={handleSaveRole} disabled={saving} className="v2-prime-save">
                         {saving ? "SAVING..." : <><FaSave /> Save Profile</>}
                       </button>
                     )}
                  </div>
                </div>

                <div className="v2-role-workspace">
                   <section className="v2-data-block">
                      <div className="block-header">
                        <FaStore className="block-icon" />
                        <h4>Role Metadata</h4>
                      </div>
                      <div className="v2-role-meta-grid">
                        <div className="v2-input-group">
                          <label>Role Name <span style={{color:'red'}}>*</span></label>
                          <input type="text" value={selectedRole.name} readOnly={true} placeholder="e.g. MANAGER" required />
                        </div>
                        <div className="v2-input-group">
                          <label>Description</label>
                          <input type="text" readOnly={!isAdmin} value={selectedRole.description || ''} onChange={(e) => setSelectedRole({...selectedRole, description: e.target.value})} placeholder="What does this role do?" />
                        </div>
                      </div>
                   </section>

                   <section className="v2-data-block margin-top">
                      <div className="block-header">
                        <FaShieldAlt className="block-icon" />
                        <h4>Menu Access Mapping</h4>
                      </div>
                      <div className="permissions-grid-premium">
                        {menus.map(menu => (
                          <div 
                            key={menu.id} 
                            className={`perm-chip ${selectedRole.menus?.some(m => m.id === menu.id) ? 'active' : ''} ${!isAdmin ? 'read-only' : ''}`}
                            onClick={() => isAdmin && toggleMenu(menu)}
                          >
                            <div className="perm-toggle"></div>
                            <div className="perm-info">
                              <span className="perm-name">{menu.name}</span>
                              <p className="perm-desc" style={{ fontSize: '10px', color: '#94a3b8', margin: '2px 0 0' }}>{menu.url}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                   </section>
                </div>
              </div>
            ) : (
              <div className="v2-empty-state">
                <div className="empty-symbol"><FaShieldAlt /></div>
                <h2>Authority Protocol Offline</h2>
                <p>Select a static role profile from the left panel to define access protocols and specific permission gates.</p>
              </div>
            )
          )}

          {/* Toast */}
          {message && (
            <div className={`v2-toast ${msgType}`} onClick={() => setMessage(null)}>
              {msgType === 'success' ? <FaCheckCircle /> : <FaExclamationCircle />}
              <span>{message}</span>
              <div className="toast-close">×</div>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .v2-layout-container { display: grid; grid-template-columns: 320px 1fr; gap: 24px; width: 100%; padding: 0 24px; }
        @media (max-width: 1024px) {
           .v2-layout-container { grid-template-columns: 1fr; padding: 0 16px; gap: 32px; }
           .v2-sidebar { height: auto; position: static; }
           .v2-empty-state { height: auto; padding: 40px 20px; }
        }
        .v2-sidebar { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(10px); border-radius: 20px; border: 1px solid #edf2f7; padding: 20px; display: flex; flex-direction: column; gap: 16px; height: calc(100vh - 180px); position: sticky; top: 24px; }
        .sidebar-action-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 4px; }
        .sidebar-action-header h3 { margin: 0; font-size: 14px; font-weight: 800; color: #1a202c; letter-spacing: 0.5px; text-transform: uppercase; }
        .v2-add-btn { width: 36px; height: 36px; background: #000; color: white; border: none; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .sidebar-search-box { position: relative; margin-bottom: 8px; }
        .sidebar-search-box .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 14px; }
        .sidebar-search-box input { width: 100%; padding: 10px 10px 10px 38px; border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc; font-size: 13px; font-weight: 600; color: #1e293b; }
        .sidebar-search-box input:focus { outline: none; border-color: #f97316; background: white; box-shadow: 0 0 0 3px #fff7ed; }
        .v2-branch-grid { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding-right: 4px; }
        .v2-branch-card { padding: 12px 14px; border-radius: 12px; background: white; border: 1px solid #f1f5f9; display: flex; align-items: center; gap: 12px; cursor: pointer; position: relative; }
        .v2-branch-card:hover { border-color: #cbd5e1; }
        .v2-branch-card.selected { border-color: #f97316; background: #fffaf0; box-shadow: 0 8px 20px rgba(249, 115, 22, 0.08); }
        .card-status-pip { width: 4px; height: 24px; border-radius: 2px; background: #e2e8f0; }
        .card-status-pip[data-status="Y"] { background: #10b981; }
        .v2-branch-card.selected .card-status-pip { background: #f97316; height: 32px; }
        .card-info { flex: 1; display: flex; flex-direction: column; gap: 4px; padding: 4px 0; }
        .card-title { font-size: 14px; font-weight: 800; color: #1e293b; line-height: 1.2; }
        .card-code { font-size: 11px; color: #94a3b8; font-weight: 600; }
        .card-tag-row { margin-top: 2px; }
        .branch-tag { color: #f97316; font-weight: 800; background: #fff7ed; padding: 2px 8px; border-radius: 6px; font-size: 10px; text-transform: uppercase; border: 1px solid #ffedd5; display: inline-block; }
        .card-chevron { font-size: 12px; color: #cbd5e1; transition: 0.3s; }
        .v2-branch-card.selected .card-chevron { color: #f97316; transform: translateX(2px); }
        .v2-hero-card { background: white; border-radius: 20px; padding: 24px; border: 1px solid #edf2f7; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        @media (max-width: 640px) {
           .v2-hero-card { flex-direction: column; align-items: flex-start; gap: 20px; padding: 20px; }
           .hero-actions { width: 100%; justify-content: flex-start; flex-wrap: wrap; }
           .v2-prime-save { width: 100%; justify-content: center; }
        }
        .hero-identity { display: flex; align-items: center; gap: 16px; }
        .hero-icon-box { width: 48px; height: 48px; background: #f1f5f9; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #64748b; }
        .hero-text h2 { margin: 0; font-size: 20px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }
        .hero-text p { margin: 2px 0 0; font-size: 12px; color: #94a3b8; font-weight: 600; }
        .hero-actions { display: flex; align-items: center; gap: 16px; }
        .v2-status-pill { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 12px; font-size: 12px; font-weight: 800; text-transform: uppercase; cursor: pointer; }
        .v2-status-pill.active { background: #ecfdf5; color: #059669; border: 1px solid #d1fae5; }
        .v2-status-pill.inactive { background: #fef2f2; color: #dc2626; border: 1px solid #fee2e2; }
        .v2-prime-save { background: #f97316; color: white; border: none; padding: 12px 28px; border-radius: 12px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 10px; box-shadow: 0 4px 10px rgba(249, 115, 22, 0.2); }
        .v2-prime-save:hover { background: #ea580c; }
        .v2-detail-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
        @media (max-width: 768px) {
           .v2-detail-grid { grid-template-columns: 1fr; }
        }
        .v2-data-block { background: white; border-radius: 16px; border: 1px solid #edf2f7; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
        .block-header { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #f8fafc; padding-bottom: 12px; }
        .block-icon { font-size: 14px; color: #f97316; }
        .block-header h4 { margin: 0; font-size: 13px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
        .v2-input-group { display: flex; flex-direction: column; gap: 8px; }
        .v2-input-group label { font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;}
        .req { color: #ef4444; margin-left: 2px; font-size: 13px; }
        .v2-input-group input { background: white; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; font-size: 14.5px; font-weight: 700; color: #0f172a; width: 100%; transition: all 0.2s ease; font-family: inherit; }
        .v2-input-group input:focus { outline: none; border-color: #f97316; box-shadow: 0 0 0 4px #fff7ed; }
        .tab-switcher-modern { display: flex; background: #f1f5f9; padding: 4px; border-radius: 12px; margin-bottom: 8px; }
        .tab-switcher-modern button { flex: 1; padding: 8px; border: none; background: none; font-size: 13px; font-weight: 800; color: #64748b; cursor: pointer; border-radius: 8px; transition: 0.2s; }
        .tab-switcher-modern button.active { background: white; color: #1e293b; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }

        .v2-role-workspace { display: flex; flex-direction: column; gap: 20px; }
        .v2-role-meta-grid { display: grid; grid-template-columns: 1fr 2fr; gap: 20px; }
        .permissions-grid-premium { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-top: 10px; }
        .perm-chip { background: white; border: 1px solid #e2e8f0; padding: 12px 16px; border-radius: 12px; display: flex; align-items: center; gap: 12px; cursor: pointer; transition: 0.2s; }
        .perm-chip:hover { border-color: #cbd5e1; background: #f8fafc; }
        .perm-chip.active { border-color: #f97316; background: #fffaf0; }
        .perm-toggle { width: 10px; height: 10px; border-radius: 50%; background: #e2e8f0; border: 2px solid white; box-shadow: 0 0 0 1px #e2e8f0; }
        .perm-chip.active .perm-toggle { background: #f97316; box-shadow: 0 0 0 1px #f97316; }
        .perm-name { font-size: 12px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
        .perm-chip.active .perm-name { color: #f97316; }
        .perm-chip.read-only { cursor: default; opacity: 0.8; }
        .perm-chip.read-only:hover { border-color: #e2e8f0; background: white; }
        .perm-chip.active.read-only:hover { border-color: #f97316; background: #fffaf0; }
        .margin-top { margin-top: 10px; }

        .v2-toast { position: fixed; bottom: 32px; right: 32px; padding: 16px 24px; border-radius: 12px; background: #1e293b; color: white; display: flex; align-items: center; gap: 12px; font-weight: 700; box-shadow: 0 20px 40px rgba(0,0,0,0.15); z-index: 1000; }
        .v2-toast.success { border-left: 4px solid #10b981; }
        .v2-toast.error { border-left: 4px solid #ef4444; }
        .toast-close { margin-left: 12px; font-size: 20px; opacity: 0.5; cursor: pointer; }
        .v2-empty-state { height: calc(100vh - 180px); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: white; border-radius: 20px; border: 1px solid #edf2f7; padding: 60px; }
        .empty-symbol { font-size: 48px; color: #e2e8f0; margin-bottom: 24px; }
        .v2-empty-state h2 { margin: 0; font-size: 20px; font-weight: 900; color: #1e293b; }
        .v2-empty-state p { margin: 12px 0 32px; color: #94a3b8; max-width: 340px; font-weight: 500; font-size: 15px; }
        .loading-state-premium { height: 100vh; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #64748b; }
      `}</style>
    </DashboardLayout>
  );
}
