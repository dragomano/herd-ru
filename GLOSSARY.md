# GLOSSARY.md — термины перевода herd-ru

Принятые переводы терминов для словаря `dict/ru.json`. Источник истины — словарь:
если запись здесь расходится с ним, правим этот файл или словарь (но не то и другое
врозь). Механику замен, секции словаря и что нельзя переводить, см. в
[AGENTS.md](AGENTS.md). Новую терминологию согласовывайте здесь, чтобы разные
чанки говорили одним языком.

## Окна и разделы

| EN | RU |
|---|---|
| Applications | Приложения |
| Settings | Настройки |
| Services | Сервисы |
| Logs | Логи |
| Log Viewer | Просмотр логов |
| Mails (окно) | Письма |
| Mail (раздел настроек) | Почта |
| Insights (окно dumps) | Диагностика |
| Updates | Обновления |
| What's New in Herd | Что нового в Herd |
| Dictation | Диктовка |
| General (настройки) | Общие |
| Advanced | Расширенные |
| Integrations | Интеграции |
| About / О Herd | О программе / О Herd |

## Сайты и приложения

| EN | RU |
|---|---|
| Site | Сайт |
| App / Application | Приложение |
| Inspector | Инспектор |
| Alias | Псевдоним |
| Group / New Group | Группа / Новая группа |
| Favorites | Избранное |
| Linked domains | Связанные домены |
| Secured (HTTPS) | Защищён (HTTPS) |
| Driver | драйвер («подходящий драйвер») |
| Share this site | Поделиться сайтом |
| Disable site / Delete site | Отключить сайт / Удалить сайт |
| Starter Kit / No Starter Kit | Стартовый набор / Без стартового набора |
| Custom | Свой |

## Рабочие области

| EN | RU |
|---|---|
| Workspace | Рабочая область |
| This directory | Этот каталог |
| A new workspace / New workspace | Новая рабочая область |
| Workspace · DB copy / Workspace · empty DB | Рабочая область · копия БД / Рабочая область · пустая БД |
| Shared (режим БД) | Общая |
| Copy (режим БД) | Копия |
| Empty (режим БД) | Пустая |
| Local branch | Локальная ветка |
| Remote branch (origin) | Удалённая ветка (origin) |
| git worktree | git worktree (в тексте — «она/копия», не склонировать) |
| Build / Build with AI | Собрать / Создать с ИИ |
| Deploy / Deployment | Развернуть / Развёртывание |
| Release / Prepare | Релиз / Подготовить |

БД рабочих областей: «копия БД» и «пустая БД» — компактные формы только в
бейджах; в предложениях — «база данных» полностью.

## Сервисы и базы данных

| EN | RU |
|---|---|
| Service | Сервис |
| Database | База данных |
| Cache & Queue | Кэш и очередь |
| Storage | Хранилище |
| Queue worker | воркер очереди |
| Port / Base Port | Порт / Базовый порт |
| Auto-start | Автозапуск |
| Run with Herd | Запускать вместе с Herd |

## Диагностика (окно Insights)

Окно целиком — «Диагностика»; вкладки (через `valueFixes`, ключи фильтров
остаются английскими — см. AGENTS.md):

| EN | RU |
|---|---|
| Dumps | Дампы |
| Queries | Запросы |
| Jobs | Задачи |
| Outgoing HTTP | Исходящие HTTP |
| Logs | Логи |
| Cache | Кэш |
| Runtime context | Контекст выполнения |
| Recording / Paused | Запись / Пауза |

## Herd Studio (виджет)

Само имя «Herd Studio» не переводится; в связном тексте — «студия» со строчной
(«откройте студию», «работают в студии»).

| EN | RU |
|---|---|
| Preview | Предпросмотр |
| Changes | Изменения |
| Code | Код |
| Application | Приложение |
| Terminal | Терминал |
| Session | Сессия |
| Public share | Публичный доступ |
| Share site and copy URL | Опубликовать сайт и скопировать URL |
| Studio badge | Бейдж Herd Studio |
| Edit with Herd (бейдж) | Изменить с помощью Herd |
| Pick element / Select element | Выбрать элемент |
| Agent working | Агент работает |
| Todos | Задачи |
| Console | Консоль |
| General (настройки студии) | Основные |
| Newest / Oldest | Сначала новые / Сначала старые |

## ИИ и агенты

| EN | RU |
|---|---|
| AI provider | Поставщик ИИ |
| Coding agent | агент кодирования |
| Model / Free models | Модель / Бесплатные модели |
| Prompt (диктовка «Build with AI») | запрос |
| Dictation | Диктовка |
| API key | Ключ API |

## Общие слова UI

| EN | RU |
|---|---|
| On / Off | Вкл / Выкл |
| Default | По умолчанию |
| Dismiss | Скрыть |
| Search | Поиск |
| Cancel / Save / Delete / Edit | Отмена / Сохранить / Удалить / Изменить |
| Loading… | Загрузка… |
| Learn more / Learn how… | Подробнее / Как устроено… |

## Не переводится

- Имена продуктов и сервисов: Herd, Herd Pro, Herd Studio, Laravel, Laravel
  Cloud, Laravel Forge, Vapor, Expose (включая планы Expose Free/Pro), OpenCode,
  Adminer, Tinkerwell, Tinker, Mailpit-подобные имена служб, `php artisan`,
  `composer`, `nvm`, `nginx`, `dnsmasq`, `dump()`, `herd workspace`.
- Payload-имена и ключи логики: `Dump`, `Query`, `Request`, `Response`, `Job`,
  `Log`, `View`, значения `case`/enum, ключи объектов, операнды сравнений.
- `Ungrouped` — идентификатор группы.
- `Update from main` — название действия; в текстах оставляем в кавычках как есть.
- Иконки-лигатуры (`Next`, `Previous`), CSS-классы, SVG-пути, шрифтовые глифы
  операторов (`=>`, `!=`) в подсказках редактора.
- Языки распознавания речи в диктовке (список DictationCore) — оставлены
  английскими; `--local` / `--remote` и другие CLI-флаги.

## Грамматические договорённости

- «ветка», не «ветвь»; «бейдж», не «значок»/«иконка».
- «студия» со строчной в тексте; «Herd Studio» — только как имя продукта.
- «dev-сервер», «dev-процессы», «.test-сайты» — через дефис.
- «фича» допускается в описаниях рабочих областей (см. словарь).
- Кавычки в UI-текстах — «ёлочки»; имена кнопок внутри предложений — тоже в
  «ёлочках», вложенность не наращиваем.
- Число + существительное: если род склоняется нельзя (статический сегмент
  шаблона), используем родительный множительный («N вхождений») или
  перестраиваем фразу; проверяйте контекст через
  `node patches/inspect-strings.js search "фраза" [чанк]`.
- Сегменты-связки (`" and "`, `" for "`, `" in "`) — только с маской `files` и
  после проверки всех вхождений в этих чанках.
