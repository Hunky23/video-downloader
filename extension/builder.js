const config = require('./builder.config');
const fs = require('node:fs/promises');
const path = require('path');
const net = require('node:net');
const sass = require("sass");
const esbuild = require("esbuild");
const chokidar = require("chokidar");

// Цвета текста в консоли ANSI (truecolor)
const colors = {
    blue: '\x1b[38;2;0;139;204m',
    yellow: '\x1b[38;2;232;213;76m',
    orange: '\x1b[38;2;238;121;1m',
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    gray: '\x1b[90m',
};

//Аргументы запуска
const STARTUP_ARGUMENTS = process.argv.slice(2);

let BUILD_MODE = '';
if (STARTUP_ARGUMENTS.some(arg => arg.toLowerCase() === 'prod')) BUILD_MODE = 'prod';
if (STARTUP_ARGUMENTS.some(arg => arg.toLowerCase() === 'dev')) BUILD_MODE = 'dev';
if (!BUILD_MODE) {
    console.error(`${colors.red}[ОШИБКА] Не указан режим сборки (prod/dev).${colors.reset}`);
    process.exit(1);
}

let IS_WATCHER_MODE = false;
if (STARTUP_ARGUMENTS.some(arg => arg.toLowerCase() === '--watch')) IS_WATCHER_MODE = true;

//Конфигурация
const SRC_DIR = path.resolve(config.SRC_DIR ? config.SRC_DIR : 'src');
const DIST_DIR = path.resolve(config.DIST_DIR ? config.DIST_DIR : 'dist');
const IS_NEED_CLEAN_DIST = config.IS_NEED_CLEAN_DIST ? config.IS_NEED_CLEAN_DIST : false;
const IS_BROWSER_EXTENSION = config.IS_BROWSER_EXTENSION ? config.IS_BROWSER_EXTENSION : false;

let hasErrors = false;

function reloadFirefoxAddon(addonPath, port = 52637) {
    return new Promise((resolve, reject) => {
        const client = net.connect(port, '127.0.0.1');
        let buffer = '';
        let step = 0;

        // Вспомогательная функция для отправки пакетов в формате протокола Firefox
        const send = (obj) => {
            const str = JSON.stringify(obj);
            client.write(`${Buffer.byteLength(str)}:${str}`);
        };

        client.on('connect', () => {
            // Шаг 1: Запрашиваем у корневого актора список сервисов браузера
            send({ to: 'root', type: 'getRoot' });
        });

        client.on('data', (chunk) => {
            buffer += chunk.toString();

            // Разбираем входящие пакеты формата <длина>:<JSON>
            while (buffer.includes(':')) {
                const colonIndex = buffer.indexOf(':');
                const length = parseInt(buffer.slice(0, colonIndex), 10);
                const messageStart = colonIndex + 1;

                if (buffer.length < messageStart + length) break; // Ждем остаток пакета

                const message = JSON.parse(buffer.slice(messageStart, messageStart + length));
                buffer = buffer.slice(messageStart + length);

                // Игнорируем приветственный пакет от сервера
                if (message.applicationType === 'browser') continue;

                if (step === 0 && message.addonsActor) {
                    // Шаг 2: Отправляем команду на установку/перезагрузку расширения
                    step = 1;
                    send({
                        to: message.addonsActor,
                        type: 'installTemporaryAddon',
                        addonPath: path.resolve(addonPath),
                    });
                } else if (step === 1) {
                    client.end();
                    if (message.error) {
                        reject(new Error(`${message.error}: ${message.message}`));
                    } else {
                        resolve(message.addon);
                    }
                }
            }
        });

        client.on('error', (err) => reject(err));
    });
}

//Обрабатываем стили
async function processStyles(srcPath) {
    const relativePath = path.relative(SRC_DIR, srcPath);
    let distPath = path.join(DIST_DIR, relativePath);
    distPath = distPath.replace(/\.scss$/, '.css');
    const options = {
        style: 'compressed'
    };
    if (BUILD_MODE === 'dev') {
        options['sourceMap'] = true;
        options['sourceMapIncludeSources'] = true;
    }

    try {
        const result = sass.compile(srcPath, options);
        await fs.mkdir(path.dirname(distPath), { recursive: true });
        await fs.writeFile(distPath, result.css);
        console.log(`${colors.blue}[ОБРАБОТАН] ${relativePath}${colors.reset}`);
    } catch (err) {
        hasErrors = true;
        console.error(`${colors.red}[ОШИБКА] ${relativePath}${colors.reset}\n${err.message}`);
    }
}

//Обрабатываем скрипты
async function processScrypt(srcPath) {
    const relativePath = path.relative(SRC_DIR, srcPath);
    let distPath = path.join(DIST_DIR, relativePath);
    const options = {
        entryPoints: [srcPath],
        bundle: true,
        write: false
    };
    if (BUILD_MODE === 'dev') {
        options['sourcemap'] = 'inline';
    }

    try {
        const result = await esbuild.build(options);
        await fs.mkdir(path.dirname(distPath), {recursive: true});
        await fs.writeFile(distPath, result.outputFiles[0].text);
        console.log(`${colors.yellow}[ОБРАБОТАН] ${relativePath}${colors.reset}`);
    } catch (err) {
        hasErrors = true;
        console.error(`${colors.red}[ОШИБКА] ${relativePath}${colors.reset}\n${err.message}`);
    }
}

//Копируем файлы
async function copyFiles(srcPath) {
    const relativePath = path.relative(SRC_DIR, srcPath);
    const distPath = path.join(DIST_DIR, relativePath);

    try {
        await fs.mkdir(path.dirname(distPath), { recursive: true });
        await fs.copyFile(srcPath, distPath);
        console.log(`${colors.orange}[ОБРАБОТАН] ${relativePath}${colors.reset}`);
    } catch (err) {
        hasErrors = true;
        console.error(`${colors.red}[ОШИБКА] ${relativePath}${colors.reset}\n${err.message}`);
    }
}

//Запускаем watcher
function startWatcher() {
    console.log(`${colors.gray}👀 Отслеживание изменений в src${path.sep}... (Ctrl+C для выхода)${colors.reset}\n`);

    let isLocked = false;
    const watcher = chokidar.watch(SRC_DIR, { ignoreInitial: true });
    ['add', 'change', 'unlink', 'unlinkDir'].forEach(event => {
        watcher.on(event, async srcPath => {
            if (isLocked) return;
            isLocked = true;
            setTimeout(() => isLocked = false, 100)

            hasErrors = false;

            const relativePath = path.relative(SRC_DIR, srcPath);

            //Добавление/изменение файла
            if (event === 'add') console.log(`${colors.gray}[ДОБАВЛЕН] Файл: ${relativePath}${colors.reset}`);
            if (event === 'change') console.log(`${colors.gray}[ИЗМЕНЁН] Файл: ${relativePath}${colors.reset}`);
            if (event === 'add' || event === 'change') {
                const fileName = path.basename(relativePath);
                const fileExt = path.extname(fileName);

                const startTime = performance.now();

                // ToDo сделать обход по рёбрам графов и собрать файлы/_partial
                if (fileExt === '.css' || fileExt === '.scss') {
                    await processStyles(srcPath);
                } else if (fileExt === '.js') {
                    await processScrypt(srcPath);
                } else {
                    await copyFiles(srcPath);
                }

                if (!hasErrors) {
                    const duration = Math.ceil(performance.now() - startTime);
                    console.log(`${colors.green}[УВЕДОМЛЕНИЕ] Сборка файла завершилась за ${duration}мс ${colors.reset}`);
                } else {
                    console.error(`${colors.red}[ОШИБКА] Сборки файла${colors.reset}`);
                }

                // Обновить расширение в браузере
                if (IS_BROWSER_EXTENSION) {
                    try {
                        const addon = await reloadFirefoxAddon(DIST_DIR, 52637);
                        console.log(`${colors.green}[УВЕДОМЛЕНИЕ] Расширение "${addon.id}" успешно обновлено в Firefox!${colors.reset}`);
                    } catch (err) {
                        console.error(`${colors.red}[ОШИБКА] При обновления в Firefox: ${err.message}`);
                    }
                }

                console.log('');

                return;
            }

            let distPath = path.join(DIST_DIR, relativePath);

            //Удаление файла/папки
            if (event === 'unlink') console.log(`${colors.gray}[УДАЛЁН] Файл: ${relativePath}${colors.reset}`);
            if (event === 'unlinkDir') console.log(`${colors.gray}[УДАЛЁНА] Директория: ${relativePath}${colors.reset}`);
            if (event === 'unlink' || event === 'unlinkDir') {
                // Рекурсия вниз по директории
                let distRelativePaths = [];
                if (event === 'unlinkDir') {
                    let distDirentPaths = [];
                    try {
                        distDirentPaths = await fs.readdir(distPath, { recursive: true, withFileTypes: true });
                    } catch (err) {
                        console.error(`\n`);
                        return;
                    }
                    distRelativePaths = distDirentPaths.filter(distDirentPath => {
                        return distDirentPath.isFile();
                    }).map(distDirentPath => {
                        return path.relative(DIST_DIR, distDirentPath.parentPath + path.sep + distDirentPath.name);
                    });
                }

                // ToDo сделать обход по рёбрам графов и собрать файлы/_partial

                // Удаляем файл/папку
                try {
                    await fs.rm(distPath, { recursive: true, force: true });
                    distRelativePaths.forEach(distRelativePath => console.log(`${colors.gray}[УДАЛЁН] Файл: ${distRelativePath}${colors.reset}`));
                    console.log(`${colors.green}[УВЕДОМЛЕНИЕ] Успешно удалёно${colors.reset}`);
                } catch (err) {
                    console.error(`${colors.red}[ОШИБКА] Удаления${colors.reset}\n${err.message}`);
                    return;
                }

                // Рекурсия вверх по директории
                let parentDir = path.dirname(distPath);
                while (parentDir.startsWith(DIST_DIR + path.sep)) {
                    try {
                        const entries = await fs.readdir(parentDir);
                        if (entries.length > 0) break;
                        await fs.rmdir(parentDir);
                    } catch (err) {
                        break;
                    }
                    parentDir = path.dirname(parentDir);
                }

                // Обновить расширение в браузере
                if (IS_BROWSER_EXTENSION) {
                    try {
                        const addon = await reloadFirefoxAddon(DIST_DIR, 52637);
                        console.log(`${colors.green}[УВЕДОМЛЕНИЕ] Расширение "${addon.id}" успешно обновлено в Firefox!${colors.reset}`);
                    } catch (err) {
                        console.error(`${colors.red}[ОШИБКА] При обновления в Firefox: ${err.message}`);
                    }
                }

                console.log('');
            }
        });
    });
}

//Запускаем сборку
async function run() {
    hasErrors = false;

    //Очищаем директорию собранных файлов
    if (IS_NEED_CLEAN_DIST) {
        try {
            await fs.rm(DIST_DIR, { recursive: true, force: true });
            console.log(`${colors.green}[ОЧИЩЕНА] Директория собираемых файлов${colors.reset}`);
        } catch (err) {
            console.log(`${colors.yellow}[ОШИБКА] Очистки директории ${DIST_DIR}${colors.reset}\n${err.message}`);
            return;
        }
    }

    console.log(`${colors.green}[УВЕДОМЛЕНИЕ] Началась сборка файлов проекта${colors.reset}`);
    const startTime = performance.now();

    //Получаем список файлов на сборку
    const srcDirentPaths = await fs.readdir(SRC_DIR, { recursive: true, withFileTypes: true });
    await Promise.allSettled(srcDirentPaths.filter(srcDirentPath => {
        if (!srcDirentPath.isFile()) return false;

        const fileExt = path.extname(srcDirentPath.name);
        return !((fileExt === '.scss' || fileExt === '.js') && srcDirentPath.name[0] === '_');

    } ).map(srcDirentPaths => {
        const fileExt = path.extname(srcDirentPaths.name);
        if (fileExt === '.css' || fileExt === '.scss') return processStyles(srcDirentPaths.parentPath + path.sep + srcDirentPaths.name);
        if (fileExt === '.js') return processScrypt(srcDirentPaths.parentPath + path.sep + srcDirentPaths.name);
        return copyFiles(srcDirentPaths.parentPath + path.sep + srcDirentPaths.name);
    }));

    if (!hasErrors) {
        const duration = Math.ceil(performance.now() - startTime);
        console.log(`${colors.green}[УВЕДОМЛЕНИЕ] Сборка файлов завершилась без ошибок за ${duration}мс${colors.reset}`);
    } else {
        console.error(`${colors.red}[ОШИБКА] Сборки файлов${colors.reset}`);
    }

    // Обновить расширение в браузере
    if (IS_BROWSER_EXTENSION) {
        try {
            const addon = await reloadFirefoxAddon(DIST_DIR, 52637);
            console.log(`${colors.green}[УВЕДОМЛЕНИЕ] Расширение "${addon.id}" успешно обновлено в Firefox!${colors.reset}`);
        } catch (err) {
            console.error(`${colors.red}[ОШИБКА] При обновления в Firefox: ${err.message}`);
        }
    }

    console.log('');

    //Запускаем watcher
    if (BUILD_MODE === 'dev' && IS_WATCHER_MODE) startWatcher();
}
run();