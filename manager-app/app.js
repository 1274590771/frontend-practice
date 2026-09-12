const form = document.querySelector('#movie-form');
const titleInput = document.querySelector('#title-input');
const directorInput = document.querySelector('#director-input');
const yearInput = document.querySelector('#year-input');
const ratingInput = document.querySelector('#rating-input');
const list = document.querySelector('#movie-list');

const STORAGE_KEY = 'movies';

let movies = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let nextId = movies.reduce((max, movie) => Math.max(max, movie.id), 0) + 1;

const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(movies));

const render = () => {
  list.replaceChildren();

  if (movies.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '还没有电影，先添加一部吧';
    list.append(li);
    return;
  }

  movies.forEach(movie => {
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

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => {
      movies = movies.filter(m => m.id !== movie.id);
      save();
      render();
    });

    actions.append(delBtn);
    li.append(info, actions);
    list.append(li);
  });
};

form.addEventListener('submit', (e) => {
  e.preventDefault();

  movies.push({
    id: nextId++,
    title: titleInput.value.trim(),
    director: directorInput.value.trim(),
    year: Number(yearInput.value),
    rating: Number(ratingInput.value),
  });

  save();
  form.reset();
  render();
});

render();
