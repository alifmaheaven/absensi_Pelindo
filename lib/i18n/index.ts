import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  id: {
    translation: {
      greeting: 'Halo', goodMorning: 'Selamat Pagi', goodAfternoon: 'Selamat Siang', goodEvening: 'Selamat Sore',
      gallery: 'Galeri', notifications: 'Notifikasi', profile: 'Profil', home: 'Beranda',
      noData: 'Belum ada data', loading: 'Memuat...', error: 'Terjadi kesalahan',
      submit: 'Kirim', cancel: 'Batal', save: 'Simpan', delete: 'Hapus',
      create: 'Buat', folder: 'Folder', folders: 'Folder', upload: 'Unggah',
      share: 'Bagikan', createFolder: 'Buat Folder Baru',
    },
  },
  en: {
    translation: {
      greeting: 'Hello', goodMorning: 'Good Morning', goodAfternoon: 'Good Afternoon', goodEvening: 'Good Evening',
      gallery: 'Gallery', notifications: 'Notifications', profile: 'Profile', home: 'Home',
      noData: 'No data', loading: 'Loading...', error: 'An error occurred',
      submit: 'Submit', cancel: 'Cancel', save: 'Save', delete: 'Delete',
      create: 'Create', folder: 'Folder', folders: 'Folders', upload: 'Upload',
      share: 'Share', createFolder: 'Create New Folder',
    },
  },
};

i18n.use(initReactI18next).init({
  resources, lng: 'id', fallbackLng: 'id',
  interpolation: { escapeValue: false },
});

export default i18n;
