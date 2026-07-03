import { round, score } from './score.js';

/**
 * Resolve data files relative to this module so the site works from GitHub
 * Pages project URLs like /VopracioDemonList/.
 */
function dataUrl(fileName) {
    return new URL(`../data/${fileName}`, import.meta.url);
}

async function fetchJson(...fileNames) {
    const errors = [];

    for (const fileName of fileNames) {
        try {
            const response = await fetch(dataUrl(fileName));
            if (!response.ok) {
                throw new Error(`${fileName} returned HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            errors.push(error.message);
        }
    }

    throw new Error(errors.join("; "));
}

export async function fetchList() {
    try {
        const list = await fetchJson('list.json', '_list.json');
        if (!Array.isArray(list)) {
            throw new Error('list.json must be an array.');
        }

        return await Promise.all(
            list.map(async (path, rank) => {
                try {
                    const level = await fetchJson(`${path}.json`);
                    return [
                        {
                            ...level,
                            path,
                            records: Array.isArray(level.records)
                                ? level.records.sort((a, b) => b.percent - a.percent)
                                : [],
                        },
                        null,
                    ];
                } catch (error) {
                    console.error(
                        `Failed to load level #${rank + 1} ${path}.`,
                        error,
                    );
                    return [null, path];
                }
            }),
        );
    } catch (error) {
        console.error('Failed to load list.', error);
        return null;
    }
}

export async function fetchEditors() {
    try {
        return await fetchJson('editors.json', '_editors.json');
    } catch (error) {
        console.error('Failed to load list editors.', error);
        return null;
    }
}

export async function fetchLeaderboard() {
    const list = await fetchList();

    if (!list) {
        return [[], ['Failed to load list data.']];
    }

    const scoreMap = {};
    const errs = [];
    list.forEach(([level, err], rank) => {
        if (err) {
            errs.push(err);
            return;
        }

        // Verification
        const verifier = Object.keys(scoreMap).find(
            (u) => u.toLowerCase() === level.verifier.toLowerCase(),
        ) || level.verifier;
        scoreMap[verifier] ??= {
            verified: [],
            completed: [],
            progressed: [],
        };
        const { verified } = scoreMap[verifier];
        verified.push({
            rank: rank + 1,
            level: level.name,
            score: score(rank + 1, 100, level.percentToQualify),
            link: level.verification,
        });

        // Records
        level.records.forEach((record) => {
            const user = Object.keys(scoreMap).find(
                (u) => u.toLowerCase() === record.user.toLowerCase(),
            ) || record.user;
            scoreMap[user] ??= {
                verified: [],
                completed: [],
                progressed: [],
            };
            const { completed, progressed } = scoreMap[user];
            if (record.percent === 100) {
                completed.push({
                    rank: rank + 1,
                    level: level.name,
                    score: score(rank + 1, 100, level.percentToQualify),
                    link: record.link,
                });
                return;
            }

            progressed.push({
                rank: rank + 1,
                level: level.name,
                percent: record.percent,
                score: score(rank + 1, record.percent, level.percentToQualify),
                link: record.link,
            });
        });
    });

    // Wrap in extra Object containing the user and total score
    const res = Object.entries(scoreMap).map(([user, scores]) => {
        const { verified, completed, progressed } = scores;
        const total = [verified, completed, progressed]
            .flat()
            .reduce((prev, cur) => prev + cur.score, 0);

        return {
            user,
            total: round(total),
            ...scores,
        };
    });

    // Sort by total score
    return [res.sort((a, b) => b.total - a.total), errs];
}