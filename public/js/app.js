document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-copy-target]').forEach((button) => {
    button.addEventListener('click', async () => {
      const target = document.querySelector(button.dataset.copyTarget);
      if (!target) return;
      try {
        await navigator.clipboard.writeText(target.value || target.textContent);
        const original = button.textContent;
        button.textContent = '복사 완료';
        setTimeout(() => { button.textContent = original; }, 1500);
      } catch {
        target.select?.();
        document.execCommand('copy');
      }
    });
  });

  document.querySelectorAll('[data-auto-dismiss]').forEach((element) => {
    setTimeout(() => element.remove(), 5000);
  });

  document.querySelectorAll('[data-confirm]').forEach((element) => {
    element.addEventListener('click', (event) => {
      if (!window.confirm(element.dataset.confirm)) event.preventDefault();
    });
  });

  const setWeekGroupState = (group, expanded) => {
    const toggle = group.querySelector('[data-week-toggle]');
    const content = group.querySelector('[data-week-content]');
    if (!toggle || !content) return;
    toggle.setAttribute('aria-expanded', String(expanded));
    content.hidden = !expanded;
    group.classList.toggle('is-expanded', expanded);
  };

  const setArtistWeekState = (artistGroup, expanded) => {
    const toggle = artistGroup.querySelector('[data-week-artist-toggle]');
    const content = artistGroup.querySelector('[data-week-artist-content]');
    if (!toggle || !content) return;
    toggle.setAttribute('aria-expanded', String(expanded));
    content.hidden = !expanded;
    artistGroup.classList.toggle('is-expanded', expanded);
  };

  document.querySelectorAll('[data-week-group]').forEach((group) => {
    const toggle = group.querySelector('[data-week-toggle]');
    if (!toggle) return;
    toggle.addEventListener('click', () => {
      setWeekGroupState(group, toggle.getAttribute('aria-expanded') !== 'true');
    });

    group.querySelectorAll('[data-week-artist-dropdown]').forEach((artistGroup) => {
      const artistToggle = artistGroup.querySelector('[data-week-artist-toggle]');
      artistToggle?.addEventListener('click', () => {
        setArtistWeekState(artistGroup, artistToggle.getAttribute('aria-expanded') !== 'true');
      });
    });
  });

  document.querySelectorAll('[data-week-expand-all]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-week-group]').forEach((group) => {
        setWeekGroupState(group, true);
        group.querySelectorAll('[data-week-artist-dropdown]').forEach((artistGroup) => setArtistWeekState(artistGroup, true));
      });
    });
  });

  document.querySelectorAll('[data-week-collapse-all]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-week-group]').forEach((group) => {
        setWeekGroupState(group, false);
        group.querySelectorAll('[data-week-artist-dropdown]').forEach((artistGroup) => setArtistWeekState(artistGroup, false));
      });
    });
  });
});
