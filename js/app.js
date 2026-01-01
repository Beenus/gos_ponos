// ГосПонос - Main Application JavaScript

(function() {
  'use strict';

  // ========================================
  // Автоматическое обновление при запуске
  // ========================================

  function forceRefreshOnLaunch() {
    // Проверяем, запущено ли приложение в standalone режиме (PWA)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         window.navigator.standalone ||
                         document.referrer.includes('android-app://');

    // Получаем время последнего обновления из sessionStorage
    const lastRefresh = sessionStorage.getItem('gosponos_last_refresh');
    const now = Date.now();

    // Если это новая сессия (нет записи в sessionStorage), обновляем страницу
    if (!lastRefresh) {
      sessionStorage.setItem('gosponos_last_refresh', now.toString());

      // Очищаем кэш и перезагружаем для получения свежего контента
      if ('caches' in window) {
        caches.keys().then(function(names) {
          names.forEach(function(name) {
            caches.delete(name);
          });
        }).then(function() {
          // Принудительная перезагрузка без кэша
          location.reload();
        });
      } else {
        // Если Cache API недоступен, просто перезагружаем
        location.reload();
      }
      return true;
    }

    return false;
  }

  // ========================================
  // Pull-to-Refresh функционал
  // ========================================

  function initPullToRefresh() {
    let startY = 0;
    let currentY = 0;
    let isPulling = false;
    let pullDistance = 0;
    const threshold = 80; // Минимальное расстояние для активации обновления

    // Создаем индикатор pull-to-refresh
    const refreshIndicator = document.createElement('div');
    refreshIndicator.id = 'pull-refresh-indicator';
    refreshIndicator.innerHTML = '<div class="refresh-spinner"></div><span class="refresh-text">Потяните для обновления</span>';
    document.body.insertBefore(refreshIndicator, document.body.firstChild);

    // Добавляем стили для индикатора
    const style = document.createElement('style');
    style.textContent = `
      #pull-refresh-indicator {
        position: fixed;
        top: -60px;
        left: 0;
        right: 0;
        height: 60px;
        background: linear-gradient(135deg, #8B4513, #D2691E);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        z-index: 9999;
        transition: transform 0.2s ease-out;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      }

      #pull-refresh-indicator.visible {
        transform: translateY(60px);
      }

      #pull-refresh-indicator.refreshing .refresh-spinner {
        animation: spin 1s linear infinite;
      }

      #pull-refresh-indicator.refreshing .refresh-text {
        display: none;
      }

      .refresh-spinner {
        width: 24px;
        height: 24px;
        border: 3px solid rgba(255,255,255,0.3);
        border-top-color: white;
        border-radius: 50%;
      }

      .refresh-text {
        color: white;
        font-size: 14px;
        font-weight: 500;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      body.pulling {
        overflow: hidden;
        touch-action: none;
      }
    `;
    document.head.appendChild(style);

    const refreshText = refreshIndicator.querySelector('.refresh-text');

    function onTouchStart(e) {
      // Проверяем, что страница прокручена в самый верх
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        isPulling = true;
      }
    }

    function onTouchMove(e) {
      if (!isPulling) return;

      currentY = e.touches[0].clientY;
      pullDistance = currentY - startY;

      // Только если тянем вниз
      if (pullDistance > 0 && window.scrollY === 0) {
        e.preventDefault();
        document.body.classList.add('pulling');

        // Ограничиваем максимальное расстояние
        const limitedDistance = Math.min(pullDistance, 150);
        const progress = limitedDistance / threshold;

        // Показываем индикатор пропорционально прогрессу
        if (limitedDistance > 10) {
          refreshIndicator.classList.add('visible');
          refreshIndicator.style.transform = `translateY(${Math.min(limitedDistance, 60)}px)`;
        }

        // Обновляем текст в зависимости от расстояния
        if (pullDistance >= threshold) {
          refreshText.textContent = 'Отпустите для обновления';
        } else {
          refreshText.textContent = 'Потяните для обновления';
        }
      }
    }

    function onTouchEnd(e) {
      if (!isPulling) return;

      document.body.classList.remove('pulling');

      if (pullDistance >= threshold) {
        // Активируем обновление
        refreshIndicator.classList.add('refreshing');
        refreshText.textContent = 'Обновление...';

        // Выполняем обновление
        setTimeout(function() {
          location.reload();
        }, 500);
      } else {
        // Сбрасываем индикатор
        refreshIndicator.classList.remove('visible');
        refreshIndicator.style.transform = '';
      }

      isPulling = false;
      pullDistance = 0;
      startY = 0;
      currentY = 0;
    }

    // Добавляем обработчики событий
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
  }

  // ========================================
  // Регистрация Service Worker
  // ========================================

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(function(registration) {
          console.log('Service Worker зарегистрирован:', registration.scope);

          // Проверяем обновления сервис-воркера
          registration.addEventListener('updatefound', function() {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', function() {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // Новая версия доступна, обновляем
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          });
        })
        .catch(function(error) {
          console.log('Ошибка регистрации Service Worker:', error);
        });

      // Перезагружаем страницу при обновлении сервис-воркера
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', function() {
        if (!refreshing) {
          refreshing = true;
          location.reload();
        }
      });
    }
  }

  // ========================================
  // Инициализация приложения
  // ========================================

  function init() {
    // Проверяем, нужно ли обновление при запуске
    const needsRefresh = forceRefreshOnLaunch();

    // Если обновление не требуется, инициализируем остальной функционал
    if (!needsRefresh) {
      // Регистрируем сервис-воркер
      registerServiceWorker();

      // Инициализируем pull-to-refresh
      initPullToRefresh();
    }
  }

  // Запускаем инициализацию после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
