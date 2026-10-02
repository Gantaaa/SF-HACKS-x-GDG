import React, { useState, useEffect } from 'react';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { useGoogleAuth } from './useGoogleAuth';
import { verifyWithAI, generateFallbackResults } from './services/verification';

// Components
import LoginScreen from './components/auth/LoginScreen';
import NavBar from './components/layout/NavBar';
import LeftPanel from './components/layout/LeftPanel';
import ProfileSetup from './components/profile/ProfileSetup';
import EditProfileModal from './components/profile/EditProfileModal';
import TargetSelection from './components/targets/TargetSelection';
import TranscriptManager from './components/transcript/TranscriptManager';
import VerificationResults from './components/results/VerificationResults';
import Dashboard from './Dashboard';

// Data
import communityCollegesData from './data/communityColleges.json';
import ucCampusesData from './data/ucCampuses.json';
import csuCampusesData from './data/csuCampuses.json';
import ccMajorsData from './data/ccMajors.json';
import ucMajorsData from './data/ucMajors.json';
import csuMajorsData from './data/csuMajors.json';

const db = getFirestore();

const COMMUNITY_COLLEGES = communityCollegesData.colleges;
const UC_CAMPUSES = ucCampusesData.campuses;
const CSU_CAMPUSES = csuCampusesData.campuses;
const CC_MAJORS = ccMajorsData.majors;
const UC_MAJORS = ucMajorsData.majors;
const CSU_MAJORS = csuMajorsData.majors;

function App() {
  const [currentStep, setCurrentStep] = useState(0);
  const [currentPage, setCurrentPage] = useState('home');
  const [selectedTargets, setSelectedTargets] = useState([]);
  const [courses, setCourses] = useState([]);
  const [verificationResults, setVerificationResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const { user, setUser, isAuthenticated, signInWithGoogle } = useGoogleAuth();
  const gePattern = user.startDate === 'fall2025_or_later' ? 'cal-getc' : 'igetc';

  // Firebase helpers
  const updateField = async (fields) => {
    if (!user?.uid) return;
    try {
      await setDoc(doc(db, "userInformation", user.uid), fields, { merge: true });
    } catch (err) {
      console.error("Firestore error:", err);
    }
  };


// Load user data on mount
useEffect(() => {
  const loadData = async () => {
    if (!user?.uid) return;
    try {
      const snap = await getDoc(doc(db, "userInformation", user.uid));
      if (snap.exists()) {
        const data = snap.data();
        
        // Load profile data
        if (data.major) setUser(prev => ({ ...prev, major: data.major }));
        if (data.communityCollege) setUser(prev => ({ ...prev, communityCollege: data.communityCollege }));
        if (data.startDate) setUser(prev => ({ ...prev, startDate: data.startDate }));
        if (data.selectedTargets) setSelectedTargets(data.selectedTargets);
        if (data.transcript) setCourses(data.transcript);
        if (data.lastVerification) setVerificationResults(data.lastVerification);
        
        // Determine which step to show based on saved data
        const hasProfile = data.major && data.communityCollege && data.startDate;
        const hasTargets = data.selectedTargets?.length > 0 && data.selectedTargets.every(t => t.major);
        const hasTranscript = data.transcript?.length > 0;
        const hasVerification = data.lastVerification;
        
        // Set the furthest completed step
        if (hasVerification) {
          setCurrentStep(3);
        } else if (hasTranscript && hasTargets) {
          setCurrentStep(2);
        } else if (hasProfile) {
          setCurrentStep(1);
        } else {
          setCurrentStep(0);
        }
      }
    } catch (err) {
      console.error("Load error:", err);
    }
  };
  loadData();
}, [user?.uid]);

  // Handlers
  const updateProfileField = async (field, value) => {
    setUser(prev => ({ ...prev, [field]: value }));
    if (user?.uid) {
      await updateField({ [field]: value });
    }
  };
  
  const toggleTarget = (campusId, campusName, system) => {
    setSelectedTargets(prev => {
      const exists = prev.find(t => t.campusId === campusId);
      if (exists) return prev.filter(t => t.campusId !== campusId);
      return [...prev, { campusId, campus: campusName, major: '', system }];
    });
  };
  
  const setTargetMajor = (campusId, major) => {
    setSelectedTargets(prev => prev.map(t => 
      t.campusId === campusId ? { ...t, major } : t
    ));
  };
  
  // Single course add (for manual entry)
  const handleAddCourse = async (course) => {
    const newCourse = { ...course, id: course.id || Date.now() };
    const updatedCourses = [...courses, newCourse];
    setCourses(updatedCourses);
    if (user?.uid) {
      await updateField({ transcript: updatedCourses });
    }
  };
  
  // Multiple courses add (for PDF parsing)
  const handleAddMultipleCourses = async (newCourses) => {
    const coursesWithIds = newCourses.map((course, index) => ({
      ...course,
      id: course.id || Date.now() + index
    }));
    const updatedCourses = [...courses, ...coursesWithIds];
    setCourses(updatedCourses);
    if (user?.uid) {
      await updateField({ transcript: updatedCourses });
    }
  };
  
  const handleRemoveCourse = async (id) => {
    const updatedCourses = courses.filter(c => c.id !== id);
    setCourses(updatedCourses);
    if (user?.uid) {
      await updateField({ transcript: updatedCourses });
    }
  };
  
  const handleClearCourses = async () => {
    setCourses([]);
    if (user?.uid) {
      await updateField({ transcript: [] });
    }
  };
  
  const handleUpdateCourse = async (updatedCourse) => {
    const updatedCourses = courses.map(c => 
      c.id === updatedCourse.id ? updatedCourse : c
    );
    setCourses(updatedCourses);
    if (user?.uid) {
      await updateField({ transcript: updatedCourses });
    }
  };
  
  const runVerification = async () => {
    const validTargets = selectedTargets.filter(t => t.major);
    if (validTargets.length === 0) {
      alert('Select at least one target with a major');
      return;
    }
  
    setIsLoading(true);
    try {
      const results = await verifyWithAI(courses, validTargets, gePattern);
      setVerificationResults(results);
      setCurrentStep(3);
      if (user?.uid) {
        await updateField({ 
          lastVerification: results, 
          lastVerificationDate: new Date().toISOString() 
        });
      }
    } catch (error) {
      const fallback = generateFallbackResults(courses, validTargets, error.message, gePattern);
      setVerificationResults(fallback);
      setCurrentStep(3);
    } finally {
      setIsLoading(false);
    }
  };

  // Login screen
  if (!isAuthenticated) {
    return <LoginScreen onSignIn={signInWithGoogle} />;
  }

  // Main app
  return (
    <div className="min-h-screen bg-gradient-to-br from-ucsc-blue via-blue-900 to-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <NavBar
          user={user}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          onEditProfile={() => setIsEditingProfile(true)}
        />

        {currentPage === 'dashboard' && <Dashboard />}

        {currentPage === 'about' && (
          <div className="glass rounded-2xl p-8">
            <h1 className="text-3xl font-bold text-white mb-4">About TransferMap</h1>
            <p className="text-white/70 mb-4">
              TransferMap helps California community college students navigate their transfer journey to UC and CSU schools.
            </p>
            <p className="text-white/70">
              We support both IGETC (for students who started before Fall 2025) and the new Cal-GETC pattern (for Fall 2025+ students).
            </p>
          </div>
        )}

        {currentPage === 'faqs' && (
          <div className="glass rounded-2xl p-8">
            <h1 className="text-3xl font-bold text-white mb-6">FAQs</h1>
            <div className="space-y-4">
              <div className="p-4 bg-white/5 rounded-xl">
                <h3 className="text-white font-semibold mb-2">What is Cal-GETC?</h3>
                <p className="text-white/70 text-sm">
                  Cal-GETC is the new general education pattern (34 units) that replaces IGETC and CSU GE for students starting Fall 2025 or later.
                </p>
              </div>
              <div className="p-4 bg-white/5 rounded-xl">
                <h3 className="text-white font-semibold mb-2">Can I still use IGETC?</h3>
                <p className="text-white/70 text-sm">
                  Yes! If you started before Fall 2025, you have "catalog rights" to complete IGETC.
                </p>
              </div>
              <div className="p-4 bg-white/5 rounded-xl">
                <h3 className="text-white font-semibold mb-2">What's different about Cal-GETC?</h3>
                <p className="text-white/70 text-sm">
                  Cal-GETC requires Oral Communication for UC (IGETC didn't), reduces units to 34, and removes foreign language from core requirements.
                </p>
              </div>
            </div>
          </div>
        )}

        {currentPage === 'home' && (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="w-full lg:w-80 flex-shrink-0">
            <LeftPanel
              user={user}
              selectedTargets={selectedTargets}
              currentStep={currentStep}
              setCurrentStep={setCurrentStep}
              courses={courses}
              verificationResults={verificationResults}
            />
            </div>

            <div className="flex-1 glass rounded-2xl p-6">
              {currentStep === 0 && (
                <ProfileSetup
                  user={user}
                  updateProfileField={updateProfileField}
                  onContinue={() => {
                    if (user.communityCollege && user.major && user.startDate) {
                      setCurrentStep(1);
                    } else {
                      alert('Please complete all fields');
                    }
                  }}
                  communityColleges={COMMUNITY_COLLEGES}
                  ccMajors={CC_MAJORS}
                />
              )}

              {currentStep === 1 && (
                <TargetSelection
                  selectedTargets={selectedTargets}
                  onToggleTarget={toggleTarget}
                  onSetMajor={setTargetMajor}
                  onContinue={async () => {
                    await updateField({ selectedTargets });
                    setCurrentStep(2);
                  }}
                  ucCampuses={UC_CAMPUSES}
                  csuCampuses={CSU_CAMPUSES}
                  ucMajors={UC_MAJORS}
                  csuMajors={CSU_MAJORS}
                />
              )}

              {currentStep === 2 && (
                <TranscriptManager
                  courses={courses}
                  onAddCourse={handleAddCourse}
                  onAddMultipleCourses={handleAddMultipleCourses}
                  onUpdateCourse={handleUpdateCourse}  // <-- ADD THIS
                  onRemoveCourse={handleRemoveCourse}
                  onClearAll={handleClearCourses}
                  onVerify={runVerification}
                  isLoading={isLoading}
                />
              )}

              {currentStep === 3 && verificationResults && (
                <VerificationResults
                  results={verificationResults}
                  onEditTargets={() => setCurrentStep(1)}
                  onEditTranscript={() => setCurrentStep(2)}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {isEditingProfile && (
        <EditProfileModal
          user={user}
          updateProfileField={updateProfileField}
          onClose={() => setIsEditingProfile(false)}
          communityColleges={COMMUNITY_COLLEGES}
          ccMajors={CC_MAJORS}
        />
      )}
    </div>
  );
}

export default App;