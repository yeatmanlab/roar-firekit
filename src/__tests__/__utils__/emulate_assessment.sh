PREVIOUS_DIR=$(pwd)
cd firebase/assessment
# firebase use --clear
# firebase use demo-gse-yeatmanlab
firebase emulators:start --project demo-gse-yeatmanlab --import assessment_export &
cd $PREVIOUS_DIR