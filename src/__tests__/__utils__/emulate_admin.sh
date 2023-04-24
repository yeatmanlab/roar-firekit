PREVIOUS_DIR=$(pwd)
cd firebase/admin
firebase use --clear
firebase use admin
firebase emulators:start --project gse-roar-admin &

# TODO use some fancy shell command to confirm that the emulators are running
# Then put the following code in an if statement
sleep 20 
export FIRESTORE_EMULATOR_HOST=localhost:8079
export GOOGLE_CLOUD_PROJECT=gse-roar-admin
firestore-import -y --backupFile ./admin_db.json
cd $PREVIOUS_DIR
