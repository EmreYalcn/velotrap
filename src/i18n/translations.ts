export type AppLanguage = 'tr' | 'en';

export const translations = {
  tr: {
    // Header & Brands
    appSubtitle: 'Ultra Hızlı Medya & İndirme Yöneticisi',
    ready: 'Hazır',
    activeDownloads: '{count} Aktif',
    converter: 'Dönüştürücü',
    networkSniffer: 'Ağ Yakalayıcı',
    chromeExtension: 'Chrome Eklentisi',
    settings: 'Ayarlar',
    extensionConnected: 'Eklenti Bağlı',
    extensionMissing: 'Eklenti Eksik',

    // Quick Command Bar
    quickUrlPlaceholder: 'YouTube, X, film sitesi veya dosya linki yapıştırın...',
    videoDownload: 'Video İndir',
    mp3Download: 'MP3 İndir',
    addUrl: 'URL Ekle',
    searchPlaceholder: 'Ara...',
    resumeAll: 'Tümünü Başlat / Devam Et',
    pauseAll: 'Tümünü Duraklat',
    toggleInspector: 'Parça ve Bağlantı Detaylarını Göster/Gizle',

    // Extension Alert Banner
    extBannerTitle: 'Google Chrome Eklentisi Henüz Kurulu Değil',
    extBannerBadge: 'Önerilen',
    extBannerDesc:
      'YouTube, Instagram, X ve film sitelerinde gezinirken tek tıkla "Videoyu İndir" ve MP3 butonunu etkinleştirmek için eklentiyi yükleyin.',
    extBannerInstallBtn: 'Eklentiyi Kur (Tek Tıkla)',
    extBannerHowTo: 'Nasıl Kurulur?',
    extBannerDismiss: 'Şimdilik Gizle',
    extSuccessMsg: 'Harika! Velotrap Chrome Eklentisi başarıyla algılandı ve bağlandı.',

    // Sidebar Categories
    categories: 'KATEGORİLER',
    catAll: 'Tümü',
    catVideo: 'Videolar',
    catMusic: 'Müzik (MP3)',
    catCompressed: 'Arşivler',
    catPrograms: 'Programlar',
    catDocuments: 'Belgeler',

    // Sidebar Status
    statusHeading: 'DURUM',
    statusAll: 'Tüm Liste',
    statusUnfinished: 'Devam Eden',
    statusFinished: 'Tamamlanan',

    // Download Table
    colFileName: 'Dosya Adı',
    colSize: 'Boyut',
    colStatus: 'Durum & Parça İlerlemesi',
    colEta: 'Kalan Süre',
    colSpeed: 'Aktarım Hızı',
    colChannels: 'Bağlantılar',
    colActions: 'İşlem',

    // Empty state
    emptyHeroTitle: 'Henüz İndirilen Dosya Yok',
    emptyHeroDesc:
      'Yukarıdaki alana YouTube, Instagram, X veya herhangi bir dosya linki yapıştırın ya da Chrome eklentisindeki "⚡ Videoyu İndir" butonuna tıklayın.',
    emptyFiltered: 'Bu filtreye uygun dosya bulunamadı.',

    // Actions & Tooltips
    actionPause: 'Duraklat',
    actionResume: 'Devam Et',
    actionOpenFile: 'Dosyayı Aç',
    actionShowInFolder: 'Klasörde Göster',
    actionDelete: 'Listeden Kaldır',
    actionDeleteWithFile: 'Dosyayı Diskten Sil',
    unknownSize: 'Bilinmiyor',

    // Settings Modal
    settingsTitle: 'Velotrap Seçenekler & Motor Yapılandırması',
    settingsSubtitle: 'Bağlantı sayısı, dil tercihi, varsayılan klasör ve motor ayarları',
    langLabel: 'Uygulama Dili / Language:',
    downloadDirLabel: 'Varsayılan İndirme Klasörü:',
    browseBtn: 'Gözat...',
    maxConnLabel: 'Dosya Başına Maksimum Parça / Bağlantı Sayısı:',
    maxConnDesc:
      'IDM mantığında dosyayı 4, 8, 16 veya 32 paralel parçaya bölerek ultra yüksek hız sağlar.',
    concurrentDownloadsLabel: 'Aynı Anda İndirilecek Maksimum Dosya:',
    speedLimitLabel: 'Genel Hız Sınırı (KB/sn):',
    speedLimitZeroHint: '0 = Sınırsız Maksimum Hız',
    clipboardMonitorLabel: 'Panodaki kopyalanan medya ve video linklerini otomatik algıla',
    autoStartLabel: 'Yeni indirme eklendiğinde hemen otomatik başlat',
    engineStatusHeading: 'Medya & Akış Motorları Durumu',
    installed: 'Yüklü & Aktif',
    notInstalled: 'Yüklü Değil',
    installing: 'İndiriliyor & Kuruluyor...',
    saveSettingsBtn: 'Ayarları Kaydet',
    cancelBtn: 'İptal',
    closeBtn: 'Kapat',

    // Status texts
    statusQueued: 'Kuyrukta',
    statusConnecting: 'Bağlanıyor',
    statusDownloading: 'İndiriliyor',
    statusMerging: 'Birleştiriliyor',
    statusPaused: 'Duraklatıldı',
    statusCompleted: 'Tamamlandı',
    statusError: 'Hata',
  },
  en: {
    // Header & Brands
    appSubtitle: 'Ultra-Fast Media & Download Manager',
    ready: 'Ready',
    activeDownloads: '{count} Active',
    converter: 'Converter',
    networkSniffer: 'Network Sniffer',
    chromeExtension: 'Chrome Extension',
    settings: 'Settings',
    extensionConnected: 'Extension Connected',
    extensionMissing: 'Extension Missing',

    // Quick Command Bar
    quickUrlPlaceholder: 'Paste YouTube, X, streaming video, or direct file link...',
    videoDownload: 'Download Video',
    mp3Download: 'Download MP3',
    addUrl: 'Add URL',
    searchPlaceholder: 'Search...',
    resumeAll: 'Resume All',
    pauseAll: 'Pause All',
    toggleInspector: 'Toggle Segment & Connection Inspector',

    // Extension Alert Banner
    extBannerTitle: 'Google Chrome Extension Not Installed Yet',
    extBannerBadge: 'Recommended',
    extBannerDesc:
      'Install the extension to activate the 1-click "Download Video" and MP3 button directly on YouTube, Instagram, X (Twitter), and movie websites.',
    extBannerInstallBtn: 'Install Extension (1-Click)',
    extBannerHowTo: 'How to Install?',
    extBannerDismiss: 'Dismiss for Now',
    extSuccessMsg: 'Awesome! Velotrap Chrome Extension successfully detected and connected.',

    // Sidebar Categories
    categories: 'CATEGORIES',
    catAll: 'All',
    catVideo: 'Videos',
    catMusic: 'Music (MP3)',
    catCompressed: 'Archives',
    catPrograms: 'Programs',
    catDocuments: 'Documents',

    // Sidebar Status
    statusHeading: 'STATUS',
    statusAll: 'All Downloads',
    statusUnfinished: 'In Progress',
    statusFinished: 'Completed',

    // Download Table
    colFileName: 'File Name',
    colSize: 'Size',
    colStatus: 'Status & Segments',
    colEta: 'Time Left',
    colSpeed: 'Speed',
    colChannels: 'Links',
    colActions: 'Actions',

    // Empty state
    emptyHeroTitle: 'No Downloads Yet',
    emptyHeroDesc:
      'Paste a YouTube, Instagram, X, or file link in the bar above, or click "⚡ Download Video" from the Chrome extension on any site.',
    emptyFiltered: 'No downloads matching this filter.',

    // Actions & Tooltips
    actionPause: 'Pause',
    actionResume: 'Resume',
    actionOpenFile: 'Open File',
    actionShowInFolder: 'Show in Folder',
    actionDelete: 'Remove from List',
    actionDeleteWithFile: 'Delete File from Disk',
    unknownSize: 'Unknown',

    // Settings Modal
    settingsTitle: 'Velotrap Options & Engine Configuration',
    settingsSubtitle: 'Connection channels, language, default directory, and engine settings',
    langLabel: 'Application Language / Uygulama Dili:',
    downloadDirLabel: 'Default Download Folder:',
    browseBtn: 'Browse...',
    maxConnLabel: 'Max Parallel Streams per Download:',
    maxConnDesc:
      'Splits downloads into 4, 8, 16, or 32 parallel segments for multi-threaded speed acceleration.',
    concurrentDownloadsLabel: 'Max Simultaneous Downloads:',
    speedLimitLabel: 'Global Speed Limit (KB/s):',
    speedLimitZeroHint: '0 = Unlimited Max Speed',
    clipboardMonitorLabel: 'Automatically capture copied media and video links from clipboard',
    autoStartLabel: 'Start downloads immediately when added',
    engineStatusHeading: 'Media & Streaming Engines Status',
    installed: 'Installed & Active',
    notInstalled: 'Not Installed',
    installing: 'Downloading & Installing...',
    saveSettingsBtn: 'Save Settings',
    cancelBtn: 'Cancel',
    closeBtn: 'Close',

    // Status texts
    statusQueued: 'Queued',
    statusConnecting: 'Connecting',
    statusDownloading: 'Downloading',
    statusMerging: 'Merging',
    statusPaused: 'Paused',
    statusCompleted: 'Completed',
    statusError: 'Error',
  },
};

export type TranslationKey = keyof typeof translations.tr;

export function t(
  lang: AppLanguage | undefined,
  key: TranslationKey,
  vars?: Record<string, string | number>
): string {
  const currentLang: AppLanguage = lang === 'en' ? 'en' : 'tr';
  let str: string = (translations[currentLang] as any)[key] || (translations.tr as any)[key] || '';
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}

