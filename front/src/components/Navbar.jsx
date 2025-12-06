import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { useTheme } from '../context/ThemeProvider';

const Navbar = ({ floating = false, children }) => {
    const { user, logout, userId } = useAuth();
    const { changeTheme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();

    const isDashboard = location.pathname === '/dashboard';

    return (
        <div className={`navbar shadow-lg z-50 transition-all duration-300 ${floating
                ? 'absolute top-0 left-0 right-0 bg-base-100/90 backdrop-blur-sm'
                : 'sticky top-0 bg-base-100'
            }`}>
            <div className="flex-1 gap-2">
                <button
                    onClick={() => navigate('/dashboard')}
                    className="btn btn-ghost text-xl font-bold text-primary normal-case"
                >
                    📋 tblanck
                </button>

                {children}

                {/* Show Back to Dashboard if not on dashboard and logged in */}
                {!isDashboard && user && (
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="btn btn-sm btn-ghost gap-2 hidden sm:inline-flex"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Dashboard
                    </button>
                )}
            </div>

            <div className="flex-none gap-2">
                {/* Theme Dropdown */}
                <div className="dropdown dropdown-end">
                    <div tabIndex={0} role="button" className="btn btn-ghost btn-circle" title="Change Theme">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                        </svg>
                    </div>
                    <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52 mt-4">
                        <li><button onClick={() => changeTheme('dark')}>Dark</button></li>
                        <li><button onClick={() => changeTheme('light')}>Light</button></li>
                        <li><button onClick={() => changeTheme('winter')}>Winter</button></li>
                        <li><button onClick={() => changeTheme('night')}>Night</button></li>
                        <li><button onClick={() => changeTheme('nord')}>Nord</button></li>
                    </ul>
                </div>

                {user && (
                    <>
                        <div className="flex items-center gap-2 mx-2">
                            <div className="avatar placeholder">
                                <div className="bg-primary text-primary-content rounded-full w-8">
                                    <span className="text-sm">{(user?.displayName || user?.email)?.[0]?.toUpperCase()}</span>
                                </div>
                            </div>
                            <div className="hidden md:block text-right leading-tight">
                                <div className="text-sm font-medium">{user?.displayName || user?.email}</div>
                                <div className="text-xs text-base-content/60">ID: {userId?.slice(0, 8)}</div>
                            </div>
                        </div>

                        <button onClick={logout} className="btn btn-ghost btn-circle" title="Logout">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default Navbar;
