const form = document.querySelector('#movie-form');
const titleInput = document.querySelector('#title-input');
const directorInput = document.querySelector('#director-input');
const yearInput = document.querySelector('#year-input');
const ratingInput = document.querySelector('#rating-input');
const submitBtn = document.querySelector('#submit-btn');
const cancelBtn = document.querySelector('#cancel-btn');
const searchInput = document.querySelector('#search-input');
const tip = document.querySelector('#tip');
const list = document.querySelector('#movie-list');

const STORAGE_KEY = 'movies';

let movies = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let nextId = movies.reduce((max, movie) => Math.max(max, movie.id), 0) + 1;
let editingId = null;
let keyword = '';

const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(movies));

const showTip = (msg) => { tip.textContent = msg; };

const clearForm = () => {
  form.reset();
  editingId = null;
  submitBtn.textContent = '添加';
  cancelBtn.hidden = true;
};

const startEdit = (movie) => {
  editingId = movie.id;
  titleInput.value = movie.title;
  directorInput.value = movie.director;
  yearInput.value = movie.year;
  ratingInput.value = movie.rating;
  submitBtn.textContent = '保存修改';
  cancelBtn.hidden = false;
  showTip('');
  titleInput.focus();
};

// 输入框为空时 Number('') 会得到 0，这里统一转成 NaN 以便校验
const readNumber = (input) => (input.value.trim() === '' ? NaN : Number(input.value));

const validate = () => {
  const year = readNumber(yearInput);
  const rating = readNumber(ratingInput);

  if (titleInput.value.trim() === '') return '片名不能为空';
  if (directorInput.value.trim() === '') return '导演不能为空';
  if (!Number.isInteger(year) || year < 1888 || year > 2100) {
    return '年份请填 1888 - 2100 之间的整数';
  }
  if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
    return '评分请填 0 - 10 之间的数字';
  }
  return '';
};

const render = () => {
  const kw = keyword.trim().toLowerCase();
  const shown = kw === ''
    ? movies
    : movies.filter(movie =>
        movie.title.toLowerCase().includes(kw) ||
        movie.director.toLowerCase().includes(kw)
      );

  list.replaceChildren();

  if (shown.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = movies.length === 0 ? '还没有电影，先添加一部吧' : '没有匹配的电影';
    list.append(li);
    return;
  }

  shown.forEach(movie => {
    const li = document.createElement('li');

    const info = document.createElement('div');

    const title = document.createElement('h2');
    title.className = 'movie-title';
    title.textContent = movie.title;

    const meta = document.createElement('p');
    meta.className = 'movie-meta';
    meta.textContent = `${movie.director} · ${movie.year} 年 · 评分 ${movie.rating}`;

    info.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', () => startEdit(movie));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => {
      movies = movies.filter(m => m.id !== movie.id);
      save();
      render();
    });

    actions.append(editBtn, delBtn);
    li.append(info, actions);
    list.append(li);
  });
};

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const error = validate();
  if (error !== '') {
    showTip(error);
    return;
  }
  showTip('');

  const data = {
    title: titleInput.value.trim(),
    director: directorInput.value.trim(),
    year: Number(yearInput.value),
    rating: Number(ratingInput.value),
  };

  if (editingId !== null) {
    const movie = movies.find(m => m.id === editingId);
    Object.assign(movie, data);
  } else {
    movies.push({ id: nextId++, ...data });
  }

  save();
  clearForm();
  render();
});

cancelBtn.addEventListener('click', () => {
  clearForm();
  showTip('');
});

searchInput.addEventListener('input', () => {
  keyword = searchInput.value;
  render();
});

render();
