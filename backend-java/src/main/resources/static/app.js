document.addEventListener('DOMContentLoaded', () => {
  const mount = document.getElementById('app');
  if (mount) {
    mount.innerHTML = '<button id="hello-btn">测试按钮</button><div id="hello-out"></div>';
    document.getElementById('hello-btn')?.addEventListener('click', () => {
      const out = document.getElementById('hello-out');
      if (out) out.textContent = '按钮已点击（原生 JS）。';
    });
  }
});


