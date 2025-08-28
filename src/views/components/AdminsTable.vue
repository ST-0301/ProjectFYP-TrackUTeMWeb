<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { doc, getDoc, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { adminCollection } from '@/firebase';
import ArgonButton from "@/components/ArgonButton.vue";
import ArgonInput from "@/components/ArgonInput.vue";


// Props
const props = defineProps({
    refreshKey: {
        type: Number,
        default: 0
    }
});
// Reactive state
// Data state
const admins = ref([]);
const currentAdmin = ref({ name: '', email: '', role: 'admin' });
const currentUser = ref(null);
const passwordResetLink = ref('');
const currentLinkTime = ref(null);
const selectedAdminEmail = ref('');
const adminToDisable = ref(null);
const adminToActivate = ref(null);
// UI state
const showAddAdminModal = ref(false);
const showLinkModal = ref(false);
const showDisableModal = ref(false);
const showActivateModal = ref(false);
const isLoading = ref(false);
const isLoadingReset = ref({});
// Table state
const sortColumn = ref("name");
const sortDirection = ref("asc");
const currentPage = ref(1);
const itemsPerPage = ref(10);
// Error state
const errors = ref({ name: '', email: '', general: '' });


// Computed properties
const sortedAdmins = computed(() => {
    if (!sortColumn.value) return admins.value;
    const column = sortColumn.value;
    const direction = sortDirection.value;
    return [...admins.value].sort((a, b) => {
        let valA = a[column];
        let valB = b[column];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });
});
const paginatedAdmins = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage.value;
    const end = start + itemsPerPage.value;
    return sortedAdmins.value.slice(start, end);
});
const totalItems = computed(() => sortedAdmins.value.length);
const totalPages = computed(() => Math.ceil(totalItems.value / itemsPerPage.value));
const showingFrom = computed(() => (currentPage.value - 1) * itemsPerPage.value + 1);
const showingTo = computed(() => {
    const to = currentPage.value * itemsPerPage.value;
    return to > totalItems.value ? totalItems.value : to;
});
const showLeftEllipsis = computed(() => {
    return currentPage.value > 3 && totalPages.value > 5;
});
const showRightEllipsis = computed(() => {
    return currentPage.value < totalPages.value - 2 && totalPages.value > 5;
});
const visiblePages = computed(() => {
    const pages = [];
    const maxVisible = 3;
    if (totalPages.value <= maxVisible) {
        for (let i = 1; i <= totalPages.value; i++) {
            pages.push(i);
        }
    } else {
        let start = Math.max(1, currentPage.value - 1);
        let end = Math.min(totalPages.value, currentPage.value + 1);
        if (currentPage.value <= 2) {
            end = maxVisible;
        } else if (currentPage.value >= totalPages.value - 1) {
            start = totalPages.value - maxVisible + 1;
        }
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
    }
    return pages;
});


// Lifecycle hooks
onMounted(async () => {
    await checkCurrentUser();
    await fetchAdmins();
});


// Helper functions
const fetchAdmins = async () => {
    try {
        isLoading.value = true;
        const querySnapshot = await getDocs(adminCollection);
        admins.value = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error("Error fetching admins:", error);
    } finally {
        isLoading.value = false;
    }
};
const checkCurrentUser = async () => {
    const auth = getAuth();
    const user = auth.currentUser;

    if (user) {
        const userDoc = await getDoc(doc(adminCollection, user.uid));
        if (userDoc.exists()) {
            currentUser.value = {
                uid: user.uid,
                email: user.email,
                role: userDoc.data().role || 'admin'
            };
            return userDoc.data().role === 'super_admin';
        }
    }
    currentUser.value = null;
    return false;
};
const copyToClipboard = () => {
    navigator.clipboard.writeText(passwordResetLink.value);
    alert('Link copied to clipboard!');
};
const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    try {
        let date;
        if (timestamp && typeof timestamp === 'object' && timestamp.toDate) {
            date = timestamp.toDate();
        }
        else if (timestamp instanceof Date) {
            date = timestamp;
        }
        else if (typeof timestamp === 'string') {
            date = new Date(timestamp);
        }
        else if (typeof timestamp === 'number') {
            date = new Date(timestamp);
        }
        else {
            console.warn('Unknown timestamp format:', timestamp);
            return 'Invalid date';
        }
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
        console.error('Error formatting date:', error, timestamp);
        return 'Invalid date';
    }
};


// Validation function
const validateForm = async () => {
    let isValid = true;

    if (!currentAdmin.value.name.trim()) {
        errors.value.name = 'Name is required';
        isValid = false;
    } else {
        errors.value.name = '';
    }
    // const emailRegex = /^[^\s@]+@utem\.edu\.my$/;
    // if (!emailRegex.test(currentAdmin.value.email)) {
    //     errors.value.email = 'Valid UTEM email required';
    //     isValid = false;
    // } else {
    //     errors.value.email = '';
    // }
    return isValid;
};


// CRUD operations
const createAdminAccountFunction = async () => {
    if (!(await validateForm())) return;

    try {
        isLoading.value = true;
        errors.value = { name: '', email: '', general: '' };
        passwordResetLink.value = '';

        const functions = getFunctions(getApp(), 'asia-southeast1');
        const callAdminManagement = httpsCallable(functions, "adminAccountManagement");
        const auth = getAuth();
        const token = await auth.currentUser.getIdToken();
        const result = await callAdminManagement({
            action: 'createAdmin',
            email: currentAdmin.value.email,
            name: currentAdmin.value.name,
            role: currentAdmin.value.role,
        }, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const adminDocRef = doc(adminCollection, result.data.adminId);
        const adminDoc = await getDoc(adminDocRef);

        if (adminDoc.exists()) {
            const adminData = adminDoc.data();
            passwordResetLink.value = adminData.link;
            selectedAdminEmail.value = result.data.selectedAdminEmail;
            currentLinkTime.value = adminData.linkGeneratedAt ? adminData.linkGeneratedAt.toDate() : new Date();

            showAddAdminModal.value = false;
            currentAdmin.value = { email: '', name: '', role: 'admin' };
            await fetchAdmins();

            showLinkModal.value = true;
        } else {
            throw new Error('Failed to retrieve admin document after creation');
        }
    } catch (error) {
        console.error('Error creating admin:', error);
        if (error.code === 'already-exists') {
            errors.value.email = 'This email address is registered';
        } else if (error.code === 'permission-denied') {
            errors.value.general = 'You do not have permission to create admin accounts';
        } else {
            errors.value.general = error.message || 'Failed to create admin account';
        }
    } finally {
        isLoading.value = false;
    }
};
const disableAdmin = async (adminId) => {
    try {
        errors.value.general = ''
        await updateDoc(doc(adminCollection, adminId), {
            status: 'disabled'
        });
        await fetchAdmins();
        showDisableModal.value = false;
        adminToDisable.value = null;
    } catch (error) {
        console.error('Error deactivating admin:', error);
        errors.value.general = error.message || 'Failed to disable admin';
    }
};
const activateAdmin = async (adminId) => {
    try {
        errors.value.general = '';
        await updateDoc(doc(adminCollection, adminId), {
            status: 'active'
        });
        await fetchAdmins();
        showActivateModal.value = false;
        adminToActivate.value = null;
    } catch (error) {
        console.error('Error activating admin:', error);
        errors.value.general = error.message || 'Failed to activate admin';
    }
};
const resetAdminPassword = async (email, adminId) => {
    try {
        isLoading.value = true;
        isLoadingReset.value[adminId] = true;
        errors.value.general = '';

        const admin = admins.value.find(a => a.email === email);
        if (!admin) {
            throw new Error('Admin not found with email: ' + email);
        }

        const adminDocRef = doc(adminCollection, admin.id);
        const adminDoc = await getDoc(adminDocRef);
        if (adminDoc.exists()) {
            const adminData = adminDoc.data();

            const functions = getFunctions(getApp(), 'asia-southeast1');
            const callAdminManagement = httpsCallable(functions, "adminAccountManagement");
            const auth = getAuth();
            const token = await auth.currentUser.getIdToken();
            const result = await callAdminManagement({
                action: 'generateResetLink',
                email: adminData.email
            }, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            await updateDoc(adminDocRef, {
                link: result.data.resetLink,
                linkGeneratedAt: serverTimestamp()
            });
            passwordResetLink.value = result.data.resetLink;
            selectedAdminEmail.value = adminData.email;
            currentLinkTime.value = new Date();
            showLinkModal.value = true;
            await fetchAdmins();
        } else {
            throw new Error('Admin document not found');
        }
    } catch (error) {
        console.error('Error resetting password:', error);
        errors.value.general = error.message || 'Failed to reset password';
    } finally {
        isLoading.value = false;
        isLoadingReset.value[adminId] = false;
    }
};


// UI handlers
const handleSort = (column) => {
    if (column === sortColumn.value) {
        sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
    } else {
        sortColumn.value = column;
        sortDirection.value = "asc";
    }
};
const confirmDisable = (adminId) => {
    adminToDisable.value = adminId;
    showDisableModal.value = true;
};
const confirmActivate = (adminId) => {
    adminToActivate.value = adminId;
    showActivateModal.value = true;
};
const showSetupLink = (admin) => {
    passwordResetLink.value = admin.link || '';
    selectedAdminEmail.value = admin.email;
    if (admin.linkGeneratedAt && admin.linkGeneratedAt.toDate) {
        currentLinkTime.value = admin.linkGeneratedAt.toDate();
    } else {
        currentLinkTime.value = admin.linkGeneratedAt || null;
    }
    showLinkModal.value = true;
};
const goToPage = (page) => {
    if (page >= 1 && page <= totalPages.value) {
        currentPage.value = page;
    }
};
const closeLinkModal = () => {
    showLinkModal.value = false;
    currentLinkTime.value = null;
    passwordResetLink.value = '';
    selectedAdminEmail.value = '';
};


// Watcher
watch(() => props.refreshKey, () => {
    fetchAdmins();
});
</script>



<template>
    <div v-if="currentUser?.role === 'super_admin'">
        <div class="card">
            <div class="card-header pb-0">
                <div class="d-flex justify-content-between align-items-center">
                    <h6>Admin Management</h6>
                    <argon-button color="success" size="sm" @click="showAddAdminModal = true">
                        <i class="ni ni-fat-add"></i> Create Admin Account
                    </argon-button>
                </div>
            </div>
            <div class="card-body">
                <div class="table-responsive p-0">
                    <table class="table table-hover align-items-center justify-content-center mb-0">
                        <thead>
                            <tr>
                                <th class="text-uppercase text-xxs font-weight-bolder ps-2 cursor-pointer"
                                    @click="handleSort('name')">
                                    Name
                                    <i v-if="sortColumn === 'name'" class="fas ms-1"
                                        :class="sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down'"></i>
                                </th>
                                <th class="text-uppercase text-xxs font-weight-bolder ps-2 cursor-pointer"
                                    @click="handleSort('email')">
                                    Email
                                    <i v-if="sortColumn === 'email'" class="fas ms-1"
                                        :class="sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down'"></i>
                                </th>
                                <th class="text-uppercase text-xxs font-weight-bolder ps-2 cursor-pointer"
                                    @click="handleSort('role')">
                                    Role
                                    <i v-if="sortColumn === 'role'" class="fas ms-1"
                                        :class="sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down'"></i>
                                </th>
                                <th class="text-uppercase text-xxs font-weight-bolder ps-2 cursor-pointer"
                                    @click="handleSort('status')">
                                    Status
                                    <i v-if="sortColumn === 'status'" class="fas ms-1"
                                        :class="sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down'"></i>
                                </th>
                                <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                    Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="paginatedAdmins.length === 0">
                                <td colspan="5" class="text-center py-4">No admin found</td>
                            </tr>
                            <tr v-for="admin in paginatedAdmins" :key="admin.id">
                                <td>
                                    <div class="d-flex">
                                        <div class="my-auto">
                                            <h6 class="mb-0 text-sm">{{ admin.name }}</h6>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <p class="text-sm font-weight-bold mb-0">{{ admin.email }}</p>
                                </td>
                                <td>
                                    <p class="text-sm font-weight-bold mb-0">{{ admin.role }}</p>
                                </td>
                                <td>
                                    <span class="badge badge-sm" :class="{
                                        'bg-gradient-success': admin.status === 'active',
                                        'bg-gradient-primary': admin.status === 'pending',
                                        'bg-gradient-secondary': admin.status === 'disabled'
                                    }">
                                        {{ admin.status }}
                                    </span>
                                </td>
                                <td class="align-middle">
                                    <button class="btn btn-link text-secondary mb-0 px-1" @click="showSetupLink(admin)"
                                        v-if="admin.status === 'pending'">
                                        <i class="fas fa-link text-xs" aria-hidden="true" title="Get Setup Link"></i>
                                        Link
                                    </button>

                                    <button class="btn btn-link text-secondary mb-0 px-1"
                                        @click="resetAdminPassword(admin.email, admin.id)"
                                        :disabled="isLoadingReset[admin.id]" v-if="admin.status === 'active'">
                                        <span v-if="!isLoadingReset[admin.id]"><i class="fas fa-key text-xs"
                                                aria-hidden="true" title="Reset Password"></i></span>
                                        <span v-else>
                                            <span class="spinner-border spinner-border-sm" role="status"
                                                aria-hidden="true"></span>
                                        </span>
                                    </button>

                                    <button class="btn btn-link text-danger mb-0 px-1" @click="confirmDisable(admin.id)"
                                        v-if="admin.role !== 'super_admin' && admin.status === 'active'">
                                        <i class="fas fa-ban text-xs" aria-hidden="true" title="Disable"></i>
                                    </button>

                                    <button class="btn btn-link text-success mb-0 px-1"
                                        @click="confirmActivate(admin.id)" v-if="admin.status === 'disabled'">
                                        <i class="fas fa-check text-xs" aria-hidden="true" title="Activate"></i>
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Pagination Controls -->
                <div class="d-flex justify-content-between align-items-center mt-3 ms-2">
                    <div class="text-sm">
                        Showing {{ showingFrom }}-{{ showingTo }} of {{ totalItems }} entries
                    </div>
                    <nav v-if="totalPages > 1">
                        <ul class="pagination pagination-sm mb-0">
                            <li class="page-item" :class="{ disabled: currentPage === 1 }">
                                <button class="page-link" @click="goToPage(1)" title="First">
                                    <i class="fas fa-angle-double-left"></i>
                                </button>
                            </li>
                            <li class="page-item" :class="{ disabled: currentPage === 1 }">
                                <button class="page-link" @click="goToPage(currentPage - 1)" title="Previous">
                                    <i class="fas fa-chevron-left"></i>
                                </button>
                            </li>

                            <li class="page-item disabled" v-if="showLeftEllipsis">
                                <span class="page-link">...</span>
                            </li>
                            <template v-for="page in visiblePages" :key="page">
                                <li class="page-item" :class="{ active: currentPage === page }">
                                    <button class="page-link" @click="goToPage(page)">{{ page }}</button>
                                </li>
                            </template>
                            <li class="page-item disabled" v-if="showRightEllipsis">
                                <span class="page-link">...</span>
                            </li>

                            <li class="page-item" :class="{ disabled: currentPage === totalPages }">
                                <button class="page-link" @click="goToPage(currentPage + 1)" title="Next">
                                    <i class="fas fa-chevron-right"></i>
                                </button>
                            </li>
                            <li class="page-item" :class="{ disabled: currentPage === totalPages }">
                                <button class="page-link" @click="goToPage(totalPages)" title="Last">
                                    <i class="fas fa-angle-double-right"></i>
                                </button>
                            </li>
                        </ul>
                    </nav>
                </div>
            </div>
        </div>

        <!-- Add Admin Modal -->
        <div class="modal fade" :class="{ 'show d-block': showAddAdminModal }" tabindex="-1" role="dialog">
            <div class="modal-dialog modal-dialog-centered" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Create New Admin</h5>
                        <button type="button" class="btn-close" @click="showAddAdminModal = false"></button>
                    </div>
                    <div class="modal-body">
                        <div v-if="errors.general" class="alert alert-danger text-white mb-3">
                            {{ errors.general }}
                        </div>

                        <form @submit.prevent="createAdminAccountFunction">
                            <div class="mb-3">
                                <label class="form-label">Full Name</label>
                                <argon-input v-model="currentAdmin.name" type="text" placeholder="Admin name"
                                    required />
                                <div v-if="errors.name" class="text-danger text-sm mt-1">{{ errors.name }}</div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Email (@utem.edu.my)</label>
                                <argon-input v-model="currentAdmin.email" type="email" placeholder="UTEM email"
                                    required />
                                <div v-if="errors.email" class="text-danger text-sm mt-1">{{ errors.email }}</div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Role</label>
                                <select v-model="currentAdmin.role" class="form-control">
                                    <option value="admin">Admin</option>
                                </select>
                            </div>

                            <div class="d-flex justify-content-end gap-3 mt-4">
                                <argon-button type="submit" color="success" variant="gradient" :disabled="isLoading">
                                    <span v-if="!isLoading">Generate Setup Link</span>
                                    <span v-else>
                                        <span class="spinner-border spinner-border-sm" role="status"
                                            aria-hidden="true"></span>
                                        Generating...
                                    </span>
                                </argon-button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-backdrop fade show" v-if="showAddAdminModal"></div>

        <!-- Link Modal -->
        <div class="modal fade" :class="{ 'show d-block': showLinkModal }" tabindex="-1" role="dialog">
            <div class="modal-dialog modal-dialog-centered" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Admin Setup Link</h5>
                        <button type="button" class="btn-close" @click="closeLinkModal"></button>
                    </div>
                    <div class="modal-body">
                        <div v-if="errors.general" class="alert alert-danger text-white mb-3">
                            {{ errors.general }}
                        </div>
                        <p>Admin account for: <strong>{{ selectedAdminEmail }}</strong></p>
                        <p>Password reset link:</p>
                        <div class="input-group mb-3">
                            <input type="text" class="form-control" :value="passwordResetLink" readonly>
                            <argon-button color="secondary" variant="outline" class="mb-0" type="button"
                                @click="copyToClipboard">
                                Copy
                            </argon-button>
                        </div>
                        <p v-if="currentLinkTime" class="text-sm text-muted mb-3">
                            <i class="fas fa-clock me-1"></i>
                            Link generated: {{ formatDate(currentLinkTime) }}
                        </p>
                        <p class="text-muted">Send this link to the admin to complete their account setup.</p>

                        <div v-if="!passwordResetLink" class="alert alert-warning text-white">
                            <i class="fas fa-exclamation-triangle me-2"></i>
                            No setup link available. Please regenerate the link.
                        </div>
                    </div>
                    <div class="d-flex justify-content-end gap-3 mt-4">
                        <argon-button color="secondary" @click="closeLinkModal">Close</argon-button>
                        <argon-button color="primary" @click="resetAdminPassword(selectedAdminEmail, null)"
                            :disabled="isLoading" v-if="!passwordResetLink">
                            <span v-if="!isLoading">Regenerate Link</span>
                            <span v-else>
                                <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                Regenerating...
                            </span>
                        </argon-button>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-backdrop fade show" v-if="showLinkModal"></div>

        <!-- Disable Confirmation Modal -->
        <div class="modal fade" :class="{ 'show d-block': showDisableModal }" tabindex="-1" role="dialog">
            <div class="modal-dialog modal-dialog-centered" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Confirm Deactivation</h5>
                        <button type="button" class="btn-close" @click="showDisableModal = false"></button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to disable this admin account?</p>
                        <p class="text-muted">The admin will no longer be able to access the system.</p>
                    </div>
                    <div class="d-flex justify-content-end gap-3 mt-4">
                        <argon-button color="secondary" @click="showDisableModal = false">Cancel</argon-button>
                        <argon-button color="danger" @click="disableAdmin(adminToDisable)">Disable</argon-button>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-backdrop fade show" v-if="showDisableModal"></div>

        <!-- Activate Confirmation Modal -->
        <div class="modal fade" :class="{ 'show d-block': showActivateModal }" tabindex="-1" role="dialog">
            <div class="modal-dialog modal-dialog-centered" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Confirm Activation</h5>
                        <button type="button" class="btn-close" @click="showActivateModal = false"></button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to activate this admin account?</p>
                        <p class="text-muted">The admin will regain access to the system.</p>
                    </div>
                    <div class="d-flex justify-content-end gap-3 mt-4">
                        <argon-button color="secondary" @click="showActivateModal = false">Cancel</argon-button>
                        <argon-button color="success" @click="activateAdmin(adminToActivate)">Activate</argon-button>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-backdrop fade show" v-if="showActivateModal"></div>
    </div>
</template>