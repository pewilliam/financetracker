// WCAG luminance calculation over the browser's resolved theme colors.
// Group opacity is composited too, including the slightly faded past-day cells.
export async function auditCalendarContrast(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    const cache = new Map();
    const rgba = color => {
      if (cache.has(color)) return cache.get(color);
      context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
      const value = [...context.getImageData(0, 0, 1, 1).data].map((part, i) => i === 3 ? part / 255 : part);
      cache.set(color, value); return value;
    };
    const over = (color, background) => color.slice(0, 3).map((part, i) => part * color[3] + background[i] * (1 - color[3]));
    const luminance = color => color.map(part => {const value = part / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;})
      .reduce((sum, part, i) => sum + part * [.2126, .7152, .0722][i], 0);
    const styles = new WeakMap();
    const style = node => {if (!styles.has(node)) styles.set(node, getComputedStyle(node)); return styles.get(node);};
    const elements = [...document.querySelectorAll('.month-calendar-view *, .month-day-modal *, .months-control-page .view-toggle button, .months-control-page > .section-head .eyebrow')];
    const results = [];
    for (const element of elements) {
      const icon = element.tagName.toLowerCase() === 'svg';
      const text = [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      const rect = element.getBoundingClientRect();
      if ((!icon && !text) || !rect.width || !rect.height || style(element).visibility === 'hidden') continue;
      const chain = []; let parent = element;
      while (parent instanceof Element) {chain.unshift(parent); parent = parent.parentElement;}
      const base = rgba(style(document.documentElement).backgroundColor).slice(0, 3);
      const paint = (index, backdrop, foreground) => {
        const current = style(chain[index]);
        let pixel = over(rgba(current.backgroundColor), backdrop);
        if (index < chain.length - 1) pixel = paint(index + 1, pixel, foreground);
        else if (foreground) pixel = over(rgba(current.color), pixel);
        return over([...pixel, Number(current.opacity)], backdrop);
      };
      const foreground = luminance(paint(0, base, true));
      const background = luminance(paint(0, base, false));
      const ratio = (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
      results.push({label: (element.textContent || element.getAttribute('aria-label') || element.parentElement?.getAttribute('aria-label') || element.tagName).trim().slice(0, 80), classes: element.getAttribute('class'), ratio, minimum: icon ? 3 : 4.5});
    }
    return {count: results.length, minimumText: Math.min(...results.filter(result => result.minimum === 4.5).map(result => result.ratio)), minimumIcon: Math.min(...results.filter(result => result.minimum === 3).map(result => result.ratio)), failures: results.filter(result => result.ratio < result.minimum)};
  });
}
