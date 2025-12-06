import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthProvider';

const Dashboard = ({ onOpenBoard }) => {
    const { user } = useAuth();
    const [boards, setBoards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [sortBy, setSortBy] = useState('updated_at');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showRenameModal, setShowRenameModal] = useState(null);
    const [showInviteModal, setShowInviteModal] = useState(null);
    const [newBoardName, setNewBoardName] = useState('');
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('viewer');
    const [confirmModal, setConfirmModal] = useState(null);

    const fetchBoards = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            if (roleFilter) params.set('role', roleFilter);
            if (sortBy) params.set('sort', sortBy);
            const res = await api.get(`/boards?${params.toString()}`);
            setBoards(res.data.boards || []);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load boards');
        } finally {
            setLoading(false);
        }
    }, [search, roleFilter, sortBy]);

    useEffect(() => { fetchBoards(); }, [fetchBoards]);

    const handleCreateBoard = async () => {
        try {
            const res = await api.post('/boards', { name: newBoardName || 'Untitled' });
            setShowCreateModal(false);
            setNewBoardName('');
            onOpenBoard(res.data.id);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to create board');
        }
    };

    const handleRenameBoard = async (boardId) => {
        try {
            await api.patch(`/boards/${boardId}`, { name: newBoardName });
            setBoards(prev => prev.map(b => b.id === boardId ? { ...b, name: newBoardName } : b));
            setShowRenameModal(null);
            setNewBoardName('');
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to rename board');
        }
    };

    const showDeleteConfirm = (boardId, boardName) => setConfirmModal({ type: 'delete', boardId, boardName });
    const showLeaveConfirm = (boardId, boardName) => setConfirmModal({ type: 'leave', boardId, boardName });

    const handleConfirmAction = async () => {
        if (!confirmModal) return;
        const { type, boardId } = confirmModal;
        setConfirmModal(null);
        try {
            if (type === 'delete') {
                await api.delete(`/boards/${boardId}`);
            } else {
                await api.delete(`/boards/${boardId}/members/${user.id}`);
            }
            setBoards(prev => prev.filter(b => b.id !== boardId));
        } catch (err) {
            setError(err.response?.data?.error || `Failed to ${type} board`);
        }
    };

    const handleInviteMember = async (boardId) => {
        try {
            await api.post(`/boards/${boardId}/members`, { email: inviteEmail, role: inviteRole });
            setShowInviteModal(null);
            setInviteEmail('');
            setInviteRole('viewer');
            fetchBoards();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to invite member');
        }
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return 'N/A';
        return new Date(timestamp * 1000).toLocaleDateString();
    };

    const getRoleBadge = (role) => {
        const colors = { owner: 'badge-success', editor: 'badge-info', viewer: 'badge-warning' };
        return <span className={`badge badge-sm ${colors[role] || 'badge-ghost'}`}>{role}</span>;
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <h1 className="text-2xl font-bold">My Boards</h1>
                <button onClick={() => setShowCreateModal(true)} className="btn btn-primary gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    New Board
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
                <input
                    type="text"
                    placeholder="Search boards..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input input-bordered input-sm w-full sm:w-64"
                />
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
                    className="select select-bordered select-sm">
                    <option value="">All Roles</option>
                    <option value="owner">Owner</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                </select>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                    className="select select-bordered select-sm">
                    <option value="updated_at">Recently Modified</option>
                    <option value="created_at">Recently Created</option>
                    <option value="name">Name</option>
                </select>
            </div>

            {/* Error Alert */}
            {error && (
                <div className="alert alert-error mb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="btn btn-sm btn-ghost">✕</button>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex justify-center py-12">
                    <span className="loading loading-spinner loading-lg text-primary"></span>
                </div>
            )}

            {/* Empty State */}
            {!loading && boards.length === 0 && (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">📋</div>
                    <h3 className="text-xl font-semibold mb-2">No boards yet</h3>
                    <p className="text-base-content/60 mb-4">Create your first whiteboard to get started</p>
                    <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
                        Create Board
                    </button>
                </div>
            )}

            {/* Board Grid */}
            {!loading && boards.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {boards.map(board => (
                        <div
                            key={board.id}
                            onClick={() => onOpenBoard(board.id)}
                            className="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 cursor-pointer group"
                        >
                            <div className="card-body p-5 relative">
                                {/* Action Menu (Top Right) */}
                                {(board.role === 'owner' || board.role === 'editor' || board.role !== 'owner') && (
                                    <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
                                        <div className="dropdown dropdown-bottom dropdown-end">
                                            <div tabIndex={0} role="button" className="btn btn-ghost btn-circle btn-xs sm:btn-sm group-hover:bg-base-200" title="Board Options">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="w-5 h-5 stroke-current">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path>
                                                </svg>
                                            </div>
                                            <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow-lg bg-base-100 rounded-box w-40 border border-base-200">
                                                {(board.role === 'owner' || board.role === 'editor') && (
                                                    <li>
                                                        <button onClick={() => { setShowRenameModal(board.id); setNewBoardName(board.name || ''); }} className="gap-2">
                                                            ✏️ Rename
                                                        </button>
                                                    </li>
                                                )}
                                                {board.role === 'owner' && (
                                                    <>
                                                        <li>
                                                            <button onClick={() => setShowInviteModal(board.id)} className="gap-2">
                                                                📧 Invite
                                                            </button>
                                                        </li>
                                                        <li>
                                                            <button onClick={() => showDeleteConfirm(board.id, board.name)} className="text-error gap-2">
                                                                🗑️ Delete
                                                            </button>
                                                        </li>
                                                    </>
                                                )}
                                                {board.role !== 'owner' && (
                                                    <li>
                                                        <button onClick={() => showLeaveConfirm(board.id, board.name)} className="text-warning gap-2">
                                                            🚪 Leave
                                                        </button>
                                                    </li>
                                                )}
                                            </ul>
                                        </div>
                                    </div>
                                )}

                                <div className="flex justify-between items-start pr-8">
                                    <div className="flex flex-col gap-1 w-full max-w-[calc(100%-2rem)]">
                                        <h3 className="card-title text-base font-bold truncate group-hover:text-primary transition-colors" title={board.name}>{board.name || 'Untitled'}</h3>
                                        <div>{getRoleBadge(board.role)}</div>
                                    </div>
                                </div>
                                <div className="divider my-2"></div>
                                <div className="text-sm text-base-content/70 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                        <span className="truncate">{board.owner_name || board.owner_email || 'Unknown'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        <span>{formatDate(board.updated_at || board.created_at)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                        <span>{board.memberCount || 1} member{(board.memberCount || 1) > 1 ? 's' : ''}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
                <div className="modal modal-open">
                    <div className="modal-box">
                        <h3 className="font-bold text-lg mb-4">Create New Board</h3>
                        <input
                            type="text"
                            placeholder="Board name"
                            value={newBoardName}
                            onChange={(e) => setNewBoardName(e.target.value)}
                            className="input input-bordered w-full mb-4"
                            autoFocus
                        />
                        <div className="modal-action">
                            <button onClick={() => { setShowCreateModal(false); setNewBoardName(''); }}
                                className="btn btn-ghost">Cancel</button>
                            <button onClick={handleCreateBoard} className="btn btn-primary">Create</button>
                        </div>
                    </div>
                    <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}></div>
                </div>
            )}

            {/* Rename Modal */}
            {showRenameModal && (
                <div className="modal modal-open">
                    <div className="modal-box">
                        <h3 className="font-bold text-lg mb-4">Rename Board</h3>
                        <input
                            type="text"
                            placeholder="New name"
                            value={newBoardName}
                            onChange={(e) => setNewBoardName(e.target.value)}
                            className="input input-bordered w-full mb-4"
                            autoFocus
                        />
                        <div className="modal-action">
                            <button onClick={() => { setShowRenameModal(null); setNewBoardName(''); }}
                                className="btn btn-ghost">Cancel</button>
                            <button onClick={() => handleRenameBoard(showRenameModal)} className="btn btn-primary">Save</button>
                        </div>
                    </div>
                    <div className="modal-backdrop" onClick={() => setShowRenameModal(null)}></div>
                </div>
            )}

            {/* Invite Modal */}
            {showInviteModal && (
                <div className="modal modal-open">
                    <div className="modal-box">
                        <h3 className="font-bold text-lg mb-4">Invite Member</h3>
                        <div className="form-control mb-4">
                            <label className="label"><span className="label-text">Email</span></label>
                            <input
                                type="email"
                                placeholder="user@example.com"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                className="input input-bordered"
                            />
                        </div>
                        <div className="form-control mb-4">
                            <label className="label"><span className="label-text">Role</span></label>
                            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
                                className="select select-bordered">
                                <option value="viewer">Viewer</option>
                                <option value="editor">Editor</option>
                            </select>
                        </div>
                        <div className="modal-action">
                            <button onClick={() => { setShowInviteModal(null); setInviteEmail(''); }}
                                className="btn btn-ghost">Cancel</button>
                            <button onClick={() => handleInviteMember(showInviteModal)} className="btn btn-info">
                                Send Invite
                            </button>
                        </div>
                    </div>
                    <div className="modal-backdrop" onClick={() => setShowInviteModal(null)}></div>
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmModal && (
                <div className="modal modal-open">
                    <div className="modal-box">
                        <h3 className="font-bold text-lg mb-2">
                            {confirmModal.type === 'delete' ? '🗑️ Delete Board' : '🚪 Leave Board'}
                        </h3>
                        <p className="py-4">
                            {confirmModal.type === 'delete'
                                ? `Are you sure you want to delete "${confirmModal.boardName || 'this board'}"? This action cannot be undone.`
                                : `Are you sure you want to leave "${confirmModal.boardName || 'this board'}"?`
                            }
                        </p>
                        <div className="modal-action">
                            <button onClick={() => setConfirmModal(null)} className="btn btn-ghost">Cancel</button>
                            <button onClick={handleConfirmAction}
                                className={`btn ${confirmModal.type === 'delete' ? 'btn-error' : 'btn-warning'}`}>
                                {confirmModal.type === 'delete' ? 'Delete' : 'Leave'}
                            </button>
                        </div>
                    </div>
                    <div className="modal-backdrop" onClick={() => setConfirmModal(null)}></div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
