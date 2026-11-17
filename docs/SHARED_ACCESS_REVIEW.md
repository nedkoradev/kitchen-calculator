# Споделен достъп — кандидат за преглед, НЕ е публикуван

Този PR не включва споделен достъп в публичния интерфейс и не публикува Firebase правила. Единствената изпълнена Firebase команда е локалният demo Emulator. Няма Admin SDK credentials, Firebase Rules deployment или копиране/миграция на потребителски записи. Публичните GitHub Pages текстури остават публични.

## Сравнение с базата

Потребителят потвърди в разговора owner-only production правила. Изходният Git файл е SHA256 b8ceb43cbcf0cf226cad6ee7e2949c38d64a24d9b8c06c1b37843405aa21f7dd (от main преди промяната). Не е извършено административно прочитане на production ruleset от тази среда. Преди внедряване е необходим нов export/сравнение с този baseline и преглед на окончателния diff. Функциите projectShape, claimed и nameKey са byte-for-byte непроменени; всички revisions, getAfter/existsAfter и транзакционни изисквания се запазват. Собственикът остава неизменно идентифициран от UID в users/{ownerUid}.

## Модел

- users/{ownerUid}/members/{memberUid}: role editor/viewer, active/revoked, непроменими UID/email/ownerUid и inviteId.
- users/{ownerUid}/access_invites/{randomId}: owner-only създаване, проверен email, роля editor/viewer, срок, pending → accepted само атомарно с валидно членство.
- users/{memberUid}/shared_bases/{ownerUid}: индекс само с reference към базата. Не е копие на база и не дава права самостоятелно.
- users/{ownerUid}/v2_cabinets, materials (включително _app_preferences с parameters/folders), v2_projects и v2_project_names: read за owner/editor/viewer, write само за owner/editor, с всички предишни проектни проверки. Неизвестни/вложени пътища остават забранени.

## Сървърно налагане

Firestore Rules са сървърната проверка. sharing-store.mjs само организира транзакциите и НЕ е доверен механизъм за сигурност. Правилата сравняват Firebase Auth UID, email_verified и firebase.sign_in_provider=google.com; използват email от удостоверения token, а не произволен клиентски email. Членство може да се приеме само с валидна pending покана за съответния акаунт, с точно предложената роля. Accepted покана не може да се използва повторно след revoke. Само собственикът може да променя роли/отнема права. Всяка нова заявка за работни данни проверява актуалното членство; JWT role/custom client полета не дават права.

## Проверки

Команда: firebase emulators:exec --only firestore --project demo-kitchen-projects --config firebase.emulators.json 'node --test --test-isolation=none tests/projects-firestore.test.mjs tests/sharing-firestore.test.mjs'

39 успешни реални Emulator теста: 30 съществуващи и 9 за споделяне. Новите сценарии покриват verified/unverified Google/email/provider, подправена роля/UID и pending покана, viewer/editor/owner/anonymous/outsider, работните колекции и параметри/папки, уникални имена/ревизии/claims с editor, директен SDK bypass, revoke върху всички работни колекции, replay, expired/cancelled покани и ново изрично поканване след отнемане. Използва се истински Firebase SDK и правилата, без SDK double.

## Преди production

1. Сравнение с export на действащите production правила непосредствено преди внедряване; без автоматично публикуване от този PR.
2. Преглед/одобрение на резултатите и окончателния rules diff.
3. Следващ интеграционен етап: избрана owner база, auth+owner generation guards, локални чернови по (actorUid, ownerUid), UI таблица за роли/покани и реакция при отнемане.
4. Проверки с два действителни Google акаунта в целевия проект след контролирано внедряване. Emulator identity claims не доказват production Google sign-in или идентичност на публикуван ruleset.
5. Публичните текстури не се представят като защитени. Частни файлове биха изисквали отделен Storage проект/правила/удостоверено зареждане и допълнително разрешение.
