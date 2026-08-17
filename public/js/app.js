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

  document.querySelectorAll('[data-artist-link-list]').forEach((list) => {
    const form = list.closest('form');
    const template = form?.querySelector('[data-artist-link-template]');
    const addButton = form?.querySelector('[data-add-artist-link]');
    const bindRemove = (row) => {
      row.querySelector('[data-remove-artist-link]')?.addEventListener('click', () => {
        const rows = list.querySelectorAll('[data-artist-link]');
        if (rows.length === 1) {
          row.querySelector('select').selectedIndex = 0;
          row.querySelector('input').value = '';
          return;
        }
        row.remove();
      });
    };

    list.querySelectorAll('[data-artist-link]').forEach(bindRemove);
    addButton?.addEventListener('click', () => {
      if (!template) return;
      list.append(template.content.cloneNode(true));
      bindRemove(list.lastElementChild);
    });
  });

  document.querySelectorAll('[data-submission-url-list]').forEach((list) => {
    const form = list.closest('form');
    const template = form?.querySelector('[data-submission-url-template]');
    const addButton = form?.querySelector('[data-add-submission-url]');
    const updateLabels = () => {
      list.querySelectorAll('[data-submission-url]').forEach((row, index) => {
        const label = row.querySelector('[data-submission-url-label]');
        if (label) label.textContent = `게시물 URL ${index + 1}`;
      });
    };
    const bindRemove = (row) => {
      row.querySelector('[data-remove-submission-url]')?.addEventListener('click', () => {
        const rows = list.querySelectorAll('[data-submission-url]');
        if (rows.length === 1) {
          row.querySelector('input').value = '';
          return;
        }
        row.remove();
        updateLabels();
      });
    };

    list.querySelectorAll('[data-submission-url]').forEach(bindRemove);
    addButton?.addEventListener('click', () => {
      if (!template) return;
      list.append(template.content.cloneNode(true));
      const addedRow = list.lastElementChild;
      bindRemove(addedRow);
      updateLabels();
      addedRow.querySelector('input')?.focus();
    });
  });

});
