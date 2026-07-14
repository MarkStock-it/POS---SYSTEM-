(function (window, document) {
  const STORAGE_KEY = 'theme';

  function getSavedTheme() {
    return localStorage.getItem(STORAGE_KEY) || 'dark';
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcons(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }

  function updateThemeIcons(theme) {
    const sunIcon = document.getElementById('sunIcon');
    const moonIcon = document.getElementById('moonIcon');
    if (!sunIcon || !moonIcon) return;

    if (theme === 'light') {
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    } else {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
    }
  }

  function initTheme() {
    setTheme(getSavedTheme());
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    setTheme(currentTheme === 'light' ? 'dark' : 'light');
  }

  window.themeUtils = {
    initTheme,
    toggleTheme,
    setTheme,
    getSavedTheme,
    updateThemeIcons,
  };
})(window, document);
