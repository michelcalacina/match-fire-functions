var functions = require('firebase-functions');

const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);


exports.updateRank = functions.database
.ref('/challenges/{clubID}/{challengeID}')
.onWrite(event => {
    // When one challenge if completed, the status assumes 4.
    if (event.data.val().status !== 4) {
        console.log("status is not 4, ignoring trigger!");
        return;
    }

    let challengerWins = parseInt(event.data.val().challengerWins);
    let challengedWins = parseInt(event.data.val().challengedWins);
    // There is no progress.
    if (challengerWins === 0 && challengedWins === 0) {
        return;
    }

    let clubID = event.params.clubID;
    let challengerUid = event.data.val().challenger;
    let challengedUid = event.data.val().challenged;

    // STEP 1 - Calculate the efficiency on challenge.
    let matchTotalPlayed = challengerWins + challengedWins;
    let matchChallengerEfficiency = (challengerWins * 100)/matchTotalPlayed;
    let matchChallengedEfficiency = (challengedWins * 100)/matchTotalPlayed;

    // STEP 2 - Calculate the score of each player.
    let matchCHallengerScore = (challengerWins * matchChallengerEfficiency)/100;
    let matchCHallengedScore = (challengedWins * matchChallengedEfficiency)/100;

    // Get the current match members rank info.
    let challengerRef = admin.database()
        .ref('/clubs-rank/' + clubID + '/' + challengerUid);
    let challengedRef = admin.database()
        .ref('/clubs-rank/' + clubID + '/' + challengedUid);

    let commandUsersRank = [];
    commandUsersRank.push(challengerRef.once('value'));
    commandUsersRank.push(challengedRef.once('value'));

    Promise.all(commandUsersRank)
    .then((snapshots) => {
        let rankChallenger = snapshots[0].val();
        let rankChallenged = snapshots[1].val();

        // Increment with current challenge
        rankChallenger.matchWins += challengerWins;
        rankChallenger.matchLoses += challengedWins;

        rankChallenged.matchWins += challengedWins;
        rankChallenged.matchLoses += challengerWins;
        
        let challengerPlus = 0;
        let challengedPlus = 0;

        // Only who wins the challenge owns the plus score points.
        if (challengerWins > challengedWins) {
            rankChallenger.challengeWins += 1;
            rankChallenged.challengeLoses += 1;
            // STEP 3 - Calculate first plus scores value from the score and diff between wins and loses.
            challengerPlus = (matchCHallengerScore * (challengerWins - challengedWins))/100;
            //STEP 4 - Calculate second plus scores from diff between levels.
            if (rankChallenger.lvl > rankChallenged.lvl) {
               challengerPlus += matchCHallengerScore/(rankChallenger.lvl - rankChallenged.lvl); 
            } else if (rankChallenger.lvl < rankChallenged.lvl) {
                challengerPlus += rankChallenged.lvl; 
            }
        } else if (challengedWins > challengerWins) {
            rankChallenged.challengeWins += 1;
            rankChallenger.challengeLoses += 1;
            // STEP 3 - Calculate first plus scores value from the score and diff between wins and loses.
            challengedPlus = (matchCHallengedScore * (challengedWins - challengerWins))/100;
            //STEP 4 - Calculate second plus scores from diff between levels.
            if (rankChallenged.lvl > rankChallenger.lvl) {
               challengedPlus += matchCHallengedScore/(rankChallenged.lvl - rankChallenger.lvl); 
            } else if (rankChallenger.lvl < rankChallenged.lvl) {
                challengedPlus += rankChallenger.lvl; 
            }
        }

        rankChallenger.experience += (matchCHallengerScore + challengerPlus);
        rankChallenged.experience += (matchCHallengedScore + challengedPlus);

        // increment level when reach 100 experience points.
        while (rankChallenger.experience >= 100) {
            rankChallenger.lvl += 1;
            rankChallenger.experience =- 100;
        }

        // increment level when reach 100 experience points.
        while (rankChallenged.experience >= 100) {
            rankChallenged.lvl += 1;
            rankChallenged.experience =- 100;
        }

        let commands = {};
        commands['/clubs-rank/' + clubID + '/' + challengerUid] = rankChallenger;
        commands['/clubs-rank/' + clubID + '/' + challengedUid] = rankChallenged;
        return admin.database().ref('/').update(commands);
    });

});
