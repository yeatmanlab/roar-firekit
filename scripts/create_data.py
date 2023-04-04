import json
import random
import string
from datetime import datetime, timedelta, date
import copy
from faker import Faker

#################################
#  helpers for generating data  #
#################################
fake = Faker()


def randomAlphaNumericString(length):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))


def arrayOfStrings(arrayLength, stringLength):
    return_array = []
    for _ in range(arrayLength):
        return_array.append(randomAlphaNumericString(stringLength))
    return return_array


def list_of_doc_ids(length):
    return [random_doc_id() for _ in range(length)]


def arrayOfNumberSelection(arrayLength, options):
    options_left = list(copy.deepcopy(options).items())
    return_array = []
    for _ in range(arrayLength):
        selection = random.choice(options_left)
        return_array.append(selection)
        options_left.remove(selection)
    return return_array


def randomDate(end_dt=date(2024, 1, 1)):
    start_dt = date(2020, 1, 1)
    time_between = end_dt - start_dt
    random_days = random.randrange(time_between.days)
    random_date = start_dt + timedelta(days=random_days)
    return random_date.strftime("%d/%m/%Y")


def randomBoolean():
    return random.choice([True, False])


def randomGroup(d, size=5):
    keys = list(d.keys())
    random.shuffle(keys)
    for i in range(0, len(keys), size):
        # yield [(key, d[key]) for key in keys[i:i + size]] # return tuples of key/value pairs
        yield keys[i : i + size]  # return array of keys


def writeToFile(object, filename):
    json_object = json.dumps(object, indent=2)
    with open(filename, "w") as outfile:
        outfile.write(json_object)


def dt_to_firestore(input_dt):
    try:
        dt = datetime.combine(input_dt.date(), input_dt.time())
    except AttributeError:
        dt = datetime.combine(input_dt, datetime.min.time())

    return {
        "__datatype__": "timestamp",
        "value": {
            "_seconds": int(dt.timestamp()),
            "_nanoseconds": int((dt.timestamp() - int(dt.timestamp())) * 1e9),
        },
    }


def random_doc_id():
    return "".join(fake.uuid4().split("-")[:4])


######################################
#  defenitions for schemas for data  #
######################################


def user_userId(userType, completeAssess, assignedAssess, completeAdmin, assignAdmin):
    # random.choice(["student", "educator", "admin", "caregiver"])
    return {
        "userType": userType,
        "firstName": fake.first_name(),
        "lastName": fake.last_name(),
        "assessmentPid": randomAlphaNumericString(16),
        "dob": dt_to_firestore(fake.date_of_birth()),
        "assessmentsCompleted": completeAssess,
        "assessmentsAssigned": assignedAssess,
        "administrationsAssigned": completeAdmin,
        "administrationsCompleted": assignAdmin,
    }


def create_assessment(task_id, finished=True):
    start_date = fake.date_time()
    if finished:
        return {
            "runId": random_doc_id(),
            "taskId": task_id,
            "completedOn": dt_to_firestore(fake.date_time_between(start_date)),
            "startedOn": dt_to_firestore(start_date),
            "rewardShown": True,
        }
    else:
        return {
            "runId": random_doc_id(),
            "completedOn": None,
            "startedOn": dt_to_firestore(start_date),
            "rewardShown": False,
        }


def user_administrations(assessments, completed):
    return {"completed": completed, "assessments": assessments}


def userId_resourceType():
    return {"id": randomAlphaNumericString(16)}


def user_studentData(schoolId, classId, grade, districtId, prevSchools, prevClasses):
    prevDistricts = []
    prevSchoolIds = []
    prevClassIds = []
    for school in prevSchools:
        prevDistricts.append(school[1]["districtId"])
        prevSchoolIds.append(school[0])
    for prevClassId in prevClasses:
        prevClassIds.append(prevClassId[0])
    return {
        "ell": randomBoolean(),
        "grade": grade,
        "classId": classId,
        "previousClassIds": list(set(prevClassIds)),
        "schoolId": schoolId,
        "previousSchoolIds": list(set(prevSchoolIds)),
        "districtId": districtId,
        "previousDistrictIds": list(set(prevDistricts)),
        "studies": list_of_doc_ids(random.randint(0, 6)),
        "previousStudies": list_of_doc_ids(random.randint(1, 6)),
    }


def user_educatorData(schoolId, districtId, prevSchools):
    prevDistricts = []
    prevSchoolIds = []
    for school in prevSchools:
        prevDistricts.append(school[1]["districtId"])
        prevSchoolIds.append(school[0])
    return {
        "previousClassIds": list_of_doc_ids(random.randint(2, 6)),
        "schoolId": schoolId,
        "previousSchoolIds": prevSchoolIds,
        "districtId": districtId,
        "previousDistrictIds": prevDistricts,
        "studies": list_of_doc_ids(random.randint(0, 4)),
        "previousStudies": list_of_doc_ids(random.randint(2, 6)),
    }


def user_careGiverData(studentIds):
    return {"students": studentIds}


def user_adminData(districtId, schoolList, classList):
    return {
        "administrationsCreated": [],
        "permissions": arrayOfStrings(random.randint(1, 4), 16),
        "classes": classList,
        "studies": list_of_doc_ids(random.randint(10, 20)),
        "districts": districtId,
        "schools": schoolList,
        "adminLevel": random.choice(["classes", "schools", "districts", "studies"]),
    }


def create_district():
    return {
        "districtName": "District-{}".format(randomAlphaNumericString(4)),
        "schools": list_of_doc_ids(
            random.randint(NUM_SCHOOLS_PER_LOW, NUM_SCHOOLS_PER_HIGH)
        ),
    }


def school(districtId):
    return {
        "schoolName": "School-{}".format(randomAlphaNumericString(4)),
        "districtId": districtId,
    }


def classId(schoolId):
    return {"schoolId": schoolId, "grade": random.randint(0, 12)}


def studies():
    return {"studyId": random_doc_id()}


def administrationId(users, classes, schools, districts, grades, assessment):
    date_opened = fake.date_time()
    date_closed = fake.date_time_between(date_opened)
    return {
        "users": users,
        "classes": classes,
        "schools": schools,
        "districts": districts,
        "grades": grades,
        "dateOpened": dt_to_firestore(date_opened),
        "dateClosed": dt_to_firestore(date_closed),
        "assessments": assessment,
        "sequential": randomBoolean(),
    }


###################
#  Generate data  #
###################

NUM_DISTRICTS = 3
NUM_SCHOOLS_PER_LOW = 3
NUM_SCHOOLS_PER_HIGH = 5
NUM_EDUCATORS_PER_LOW = 2
NUM_EDUCATORS_PER_HIGH = 5
NUM_STUDENTS_PER_LOW = 2
NUM_STUDENTS_PER_HIGH = 4
districts = {}
schools = {}
students = {}
admins = {}
educators = {}
classes = {}
prevClasses = {}
administrations = {}
user_admins = {}
users = {}

# Create districts
for _ in range(NUM_DISTRICTS):
    districts[random_doc_id()] = create_district()

# For each district, create schools
for district in districts:
    for schoolId in districts[district]["schools"]:
        schools[schoolId] = school(district)
classes_by_school = {}
student_by_classes = {}
# For each school, create educators, classes
for school in schools:
    # Create educators
    for _ in range(NUM_EDUCATORS_PER_LOW, NUM_EDUCATORS_PER_HIGH):
        educatorKey = randomAlphaNumericString(10)
        educators[educatorKey] = user_educatorData(
            school,
            schools[school]["districtId"],
            arrayOfNumberSelection(random.randint(0, 3), schools),
        )
        users[educatorKey] = user_userId("educator", None, None, None, None)

    # For each educator, make a class
    classes_by_school[school] = []
    for educator in educators:
        newClass = classId(school)
        newClassId = randomAlphaNumericString(16)
        classes[newClassId] = newClass
        classes_by_school[school].append(newClassId)
        # Create a list of 'previous classes' for this school
        finishedClasses = {}
        for _ in range(4):
            finishedClasses[randomAlphaNumericString(16)] = classId(school)
        # save previous classes back to object, just in case we need it.
        prevClasses[school] = finishedClasses
        # For each class, make some students
        for x in classes:
            student_by_classes[x] = []
            for _ in range(NUM_STUDENTS_PER_LOW, NUM_STUDENTS_PER_HIGH):
                studentKey = randomAlphaNumericString(16)
                newStudent = user_studentData(
                    school,
                    x,
                    classes[x]["grade"],
                    schools[school]["districtId"],
                    arrayOfNumberSelection(random.randint(0, 3), schools),
                    arrayOfNumberSelection(random.randint(1, 3), finishedClasses),
                )
                students[studentKey] = newStudent
                student_by_classes[x].append(studentKey)
                users[studentKey] = user_userId("student", None, None, None, None)
# Create administrators for each district
for district in districts:
    admin_classes = []
    for school in districts[district]["schools"]:
        admin_classes.extend(classes_by_school[school])
    for _ in range(4):
        adminKey = randomAlphaNumericString(16)
        admins[adminKey] = user_adminData(
            district, districts[district]["schools"], admin_classes
        )
        users[adminKey] = user_userId("admin", None, None, None, None)

# Create caregivers for students
caregivers = {}
for student in students:
    caregiverKey = randomAlphaNumericString(16)
    caregivers[caregiverKey] = user_careGiverData([student])
    users[caregiverKey] = user_userId("caregiver", None, None, None, None)

# Create a few administrations based on group of classes
for group in randomGroup(classes, random.randint(5, 10)):
    # need user, school, district, grade, assesments for administration
    admin_schools = []
    admin_districts = []
    admin_grades = []
    admin_users = []
    admin_id = randomAlphaNumericString(16)
    # define runs for this administration
    admin_runIds = [
        {"taskId": "swr", "variant": randomAlphaNumericString(6)},
        {"taskId": "pa", "variant": randomAlphaNumericString(6)},
        {"taskId": "sre", "variant": randomAlphaNumericString(6)},
        {"taskId": "fakeTask", "variant": randomAlphaNumericString(6)},
    ]
    swr_run = create_assessment("swr", True)
    pa_run = create_assessment("pa", True)
    sre_run = create_assessment("sre", False)
    fake_run = create_assessment("fakeTask", True)
    # Gather data for this administration
    for id in group:
        admin_school = schools[classes[id]["schoolId"]]
        admin_schools.append(classes[id]["schoolId"])
        admin_districts.append(admin_school["districtId"])
        admin_grades.append(classes[id]["grade"])
        admin_users.extend(student_by_classes[id])
    # Generate the user_administration record
    for user in admin_users:
        user_admins[user] = user_administrations(
            {"swr": swr_run, "pa": pa_run, "sre": sre_run, "fakeRun": fake_run}, False
        )
    # use list(set()) to make lists of unique items
    administrations[admin_id] = administrationId(
        admin_users,
        group,
        list(set(admin_schools)),
        list(set(admin_districts)),
        list(set(admin_grades)),
        admin_runIds,
    )

# Format the generated objects and write to file
db = {
    "districts": districts,
    "schools": schools,
    "educators": educators,
    "classes": classes,
    "students": students,
    "careGivers": caregivers,
    "admins": admins,
    "administrations": administrations,
    "user_administrations": user_admins,
}

writeToFile(db, "out.json")


# should admin/districts be a string? I assume they only admin for one district
