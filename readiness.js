const fetch = require("node-fetch");
const table = require("text-table");

exports.handler = async (event, context, callback) => {
    console.log("Starting lambda");

    const clanLeague = event.clan_league || "gold";
    const clanDataResponse = await fetch("https://api.royaleapi.com/clan/" + event.clan_id, {
        headers: { auth: process.env.ROYALE_API_KEY },
    });

    const clanData = await clanDataResponse.json();
    const clanTags = clanData.members.map(data => data.tag);

    let fetchedPlayers = [];
    for (let i = 0; i < clanTags.length; i++) {
        const response = await fetch("https://api.royaleapi.com/player/" + clanTags[i], {
            headers: { auth: process.env.ROYALE_API_KEY },
        });
        if (response.status === 200) {
            fetchedPlayers.push(await response.json());
        } else if (response.status === 429) {
            console.log("Sleeping and retrying");
            await sleep(500);
            i--;
        } else {
            throw new Error("Unknown error =, " + response.status + ", " + response.text());
        }
    }

    const warReadinessTable = fetchedPlayers
        .map(player => {
            const userCards = player.cards;
            const percent = {
                legendary: 0,
                gold: 0,
                silver: 0,
                bronze: 0,
            };

            for (let j = 0; j < userCards.length; j++) {
                const card = userCards[j];
                const levelDiff = card.maxLevel - card.displayLevel;
                switch (levelDiff) {
                    case 0:
                    case 1:
                        percent.legendary++;
                    case 2:
                        percent.gold++;
                    case 3:
                        percent.silver++;
                    case 4:
                        percent.bronze++;
                }
            }
            console.log(percent);

            const retur = {
                name: player.name,
                legendary: percent.legendary / 90.0 * 100,
                gold: percent.gold / 90.0 * 100,
                silver: percent.silver / 90.0 * 100,
                bronze: percent.bronze / 90.0 * 100,
            };
            console.log(retur);
            return retur;
        })
        .sort((a, b) => b[clanLeague] - a[clanLeague])
        .map(r => [
            r.name,
            r.legendary.toFixed(0) + "%",
            r.gold.toFixed(0) + "%",
            r.silver.toFixed(0) + "%",
            r.bronze.toFixed(0) + "%",
        ]);

    console.log(warReadinessTable);
    await writeClanwarReadinessDescription(event.discord_key);
    await sendTableToDiscord(
        table([["Navn", "Legendary", "Gold", "Silver", "Bronze"]].concat(warReadinessTable)),
        event.discord_key,
        true
    );
};

const sleep = ms => {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
};

const writeClanwarReadinessDescription = discord => {
    return fetch("https://discordapp.com/api/webhooks/" + discord, {
        method: "POST",
        body: JSON.stringify({
            content: "Viser hvor mange kort hvert klanmedlem har i level til klankrig i de ulike ligaene.",
        }),
        headers: { "Content-Type": "application/json" },
    });
};

const sendTableToDiscord = async (tableText, discordKey, wait) => {
    for (let i = 0; i < tableText.split("\n").length; i += 20) {
        var responseText =
            "```" +
            tableText
                .split("\n")
                .slice(i, i + 20)
                .join("\n") +
            "```";
        console.log("Generated response:", responseText);
        const webhook = fetch("https://discordapp.com/api/webhooks/" + discordKey, {
            method: "POST",
            body: JSON.stringify({ content: responseText }),
            headers: { "Content-Type": "application/json" },
        })
            .then(response => console.log("Request ok:", response.statusText))
            .catch(err => console.log("Request failed:", err));
        if (wait) {
            await Promise.all([webhook]);
        }
    }
};
