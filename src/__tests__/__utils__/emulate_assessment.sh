PREVIOUS_DIR=$(pwd)
cd firebase/assessment
firebase use --clear
firebase use assessment
firebase emulators:start --project gse-yeatmanlab & > /dev/null 2>&1

# TODO use some fancy shell command to confirm that the emulators are running
# Then put the following code in an if statement
sleep 10
export FIRESTORE_EMULATOR_HOST=localhost:8079
export GOOGLE_CLOUD_PROJECT=gse-yeatmanlab
firestore-import -y --backupFile  ./assessment_db.json
cd $PREVIOUS_DIR