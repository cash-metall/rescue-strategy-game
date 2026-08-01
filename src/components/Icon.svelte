<script lang="ts">
  // Инлайновая SVG-иконка объекта (юнит, постройка). Путь — относительно `public/images/`.
  // Тексты логов/тостов оставляем на эмодзи — сюда идут только заголовки карточек и строки списков.
  let { src, alt = '', size = 18 }: { src: string; alt?: string; size?: number } = $props();
  const base = import.meta.env.BASE_URL + 'images/';
</script>

<img class="ic" src="{base}{src}" {alt} aria-hidden={alt ? undefined : true}
     style="width:{size}px;height:{size}px" />
