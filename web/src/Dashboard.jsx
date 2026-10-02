import React, { useState, useEffect } from 'react';
import { 
  BarChart3, TrendingUp, BookOpen, Target, CheckCircle, XCircle, 
  AlertTriangle, GraduationCap, ChevronDown, Calendar, Award, Clock
} from 'lucide-react';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { useGoogleAuth } from './useGoogleAuth';
import { calculateTranscriptStats, getUnitsProgress } from './services/calculations';

const db = getFirestore();

const Dashboard = () => {
  const { user } = useGoogleAuth();
  const [userData, setUserData] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const loadUserData = async () => {
      if (!user?.uid) return;
      try {
        const snap = await getDoc(doc(db, "userInformation", user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setUserData(data);
          if (data.lastVerification?.targets?.length > 0) {
            setSelectedTarget(data.lastVerification.targets[0]);
          }
        }
      } catch (err) {
        console.error("Error loading dashboard:", err);
      }
    };
    loadUserData();
  }, [user?.uid]);

  // Use shared calculation function
  const calculatedStats = calculateTranscriptStats(userData?.transcript);
  const unitsProgress = getUnitsProgress(calculatedStats.totalUnits);

  // No verification yet - show locked state
  if (!userData?.lastVerification) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-white/10 flex items-center justify-center">
          <BarChart3 className="w-10 h-10 text-white/40" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-4">Dashboard Locked</h2>
        <p className="text-white/60 mb-6">Complete the verification process to unlock your personalized dashboard.</p>
        <div className="flex items-center justify-center gap-4 text-white/40 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" /> Profile
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" /> Targets
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" /> Transcript
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-400" /> Verify
          </div>
        </div>
      </div>
    );
  }

  const { targets, ge_status, gePattern } = userData.lastVerification;
  const completedGE = ge_status ? Object.values(ge_status).filter(g => g.completed).length : 0;
  const totalGE = ge_status ? Object.keys(ge_status).length : 12;
  const gePercentage = Math.round((completedGE / totalGE) * 100);

  const getStatusColor = (status) => {
    if (status === 'likely_eligible') return 'text-emerald-400';
    if (status === 'conditional') return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-white/60">Your transfer progress overview</p>
        </div>
        <div className="text-right text-white/40 text-sm">
          <p>Last verified</p>
          <p className="text-white/60">
            {userData.lastVerificationDate 
              ? new Date(userData.lastVerificationDate).toLocaleDateString() 
              : 'N/A'}
          </p>
        </div>
      </div>

      {/* Main Stats Row - Using calculated stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* GPA Card */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-white/60 text-sm">GPA</span>
          </div>
          <p className="text-3xl font-bold text-white">{calculatedStats.gpa}</p>
          <p className="text-white/40 text-xs mt-1">{calculatedStats.gradedUnits} graded units</p>
        </div>

        {/* Units Card */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-purple-400" />
            </div>
            <span className="text-white/60 text-sm">Units</span>
          </div>
          <p className="text-3xl font-bold text-white">{calculatedStats.totalUnits}</p>
          <div className="mt-2">
            <div className="w-full bg-white/10 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all ${unitsProgress.isMet ? 'bg-emerald-500' : 'bg-purple-500'}`}
                style={{ width: `${unitsProgress.percentage}%` }}
              />
            </div>
            <p className="text-white/40 text-xs mt-1">
              {unitsProgress.isMet 
                ? '✓ Meets 60 unit requirement' 
                : `${unitsProgress.remaining} more needed`}
            </p>
          </div>
        </div>

        {/* GE Progress Card */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-ucsc-gold/20 flex items-center justify-center">
              <Award className="w-5 h-5 text-ucsc-gold" />
            </div>
            <span className="text-white/60 text-sm">{gePattern === 'cal-getc' ? 'Cal-GETC' : 'IGETC'}</span>
          </div>
          <p className="text-3xl font-bold text-white">{completedGE}/{totalGE}</p>
          <div className="mt-2">
            <div className="w-full bg-white/10 rounded-full h-2">
              <div 
                className="bg-ucsc-gold h-2 rounded-full transition-all" 
                style={{ width: `${gePercentage}%` }}
              />
            </div>
            <p className="text-white/40 text-xs mt-1">{gePercentage}% complete</p>
          </div>
        </div>

        {/* Targets Card */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Target className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-white/60 text-sm">Targets</span>
          </div>
          <p className="text-3xl font-bold text-white">{targets.length}</p>
          <p className="text-white/40 text-xs mt-1">
            {targets.filter(t => t.eligibility_status === 'likely_eligible').length} likely eligible
          </p>
        </div>
      </div>

      {/* Target Selector Dropdown - Fixed overflow */}
      <div className="glass rounded-2xl p-4" style={{ overflow: 'visible' }}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-ucsc-gold" />
            Target Details
          </h3>
          
          {/* Dropdown - Fixed positioning */}
          <div className="relative z-50">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-3 px-4 py-2 bg-white/10 rounded-xl text-white hover:bg-white/15 transition-all min-w-[250px]"
            >
              <span className="flex-1 text-left truncate">
                {selectedTarget?.campus || 'Select Target'}
              </span>
              <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {dropdownOpen && (
              <>
                {/* Backdrop to close dropdown */}
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setDropdownOpen(false)}
                />
                
                {/* Dropdown menu */}
                <div className="absolute right-0 mt-2 w-[320px] bg-slate-800 border border-white/20 rounded-xl shadow-2xl z-50 max-h-[400px] overflow-y-auto">
                  {targets.map((target, i) => (
                    <div
                      key={i}
                      onClick={() => { setSelectedTarget(target); setDropdownOpen(false); }}
                      className={`px-4 py-3 cursor-pointer transition-all border-b border-white/5 last:border-0 ${
                        selectedTarget?.campus === target.campus 
                          ? 'bg-ucsc-gold/20' 
                          : 'hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium ${
                            selectedTarget?.campus === target.campus ? 'text-ucsc-gold' : 'text-white'
                          }`}>
                            {target.campus}
                          </p>
                          <p className="text-white/50 text-xs truncate">{target.major}</p>
                        </div>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          target.eligibility_status === 'likely_eligible' ? 'bg-emerald-500' :
                          target.eligibility_status === 'conditional' ? 'bg-amber-500' : 'bg-red-500'
                        }`}>
                          {target.eligibility_status === 'likely_eligible' ? 
                            <CheckCircle className="w-4 h-4 text-white" /> : 
                            target.eligibility_status === 'conditional' ?
                            <span className="text-white text-sm font-bold">?</span> :
                            <XCircle className="w-4 h-4 text-white" />
                          }
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Selected Target Details */}
        {selectedTarget && (
          <div className="space-y-4">
            {/* Status Banner */}
            <div className={`rounded-xl p-4 ${
              selectedTarget.eligibility_status === 'likely_eligible' ? 'bg-emerald-500/20' :
              selectedTarget.eligibility_status === 'conditional' ? 'bg-amber-500/20' : 'bg-red-500/20'
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h4 className={`text-lg font-bold ${getStatusColor(selectedTarget.eligibility_status)}`}>
                    {selectedTarget.eligibility_status === 'likely_eligible' ? 'Likely Eligible' :
                     selectedTarget.eligibility_status === 'conditional' ? 'Conditionally Eligible' : 'Not Yet Eligible'}
                  </h4>
                  <p className="text-white/60 text-sm">{selectedTarget.campus} • {selectedTarget.major}</p>
                </div>
                {selectedTarget.eligibility_status === 'likely_eligible' ? 
                  <CheckCircle className="w-10 h-10 text-emerald-400" /> :
                  selectedTarget.eligibility_status === 'conditional' ?
                  <AlertTriangle className="w-10 h-10 text-amber-400" /> :
                  <XCircle className="w-10 h-10 text-red-400" />
                }
              </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Major Requirements */}
              <div className="bg-white/5 rounded-xl p-4">
                <h5 className="text-white font-medium mb-3 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-ucsc-gold" />
                  Major Requirements
                </h5>
                
                {selectedTarget.major_requirements?.completed?.length > 0 && (
                  <div className="mb-3">
                    <p className="text-emerald-400 text-xs mb-2 font-medium">
                      ✓ Completed ({selectedTarget.major_requirements.completed.length})
                    </p>
                    <div className="space-y-1">
                      {selectedTarget.major_requirements.completed.slice(0, 5).map((req, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                          <span className="text-white/70 truncate">{req.name}</span>
                          {req.matched_course && (
                            <span className="text-emerald-400/60 text-xs ml-auto flex-shrink-0">
                              {req.matched_course}
                            </span>
                          )}
                        </div>
                      ))}
                      {selectedTarget.major_requirements.completed.length > 5 && (
                        <p className="text-white/40 text-xs pl-5">
                          +{selectedTarget.major_requirements.completed.length - 5} more
                        </p>
                      )}
                    </div>
                  </div>
                )}
                
                {selectedTarget.major_requirements?.missing?.length > 0 && (
                  <div>
                    <p className="text-red-400 text-xs mb-2 font-medium">
                      ✗ Missing ({selectedTarget.major_requirements.missing.length})
                    </p>
                    <div className="space-y-1">
                      {selectedTarget.major_requirements.missing.slice(0, 5).map((req, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <XCircle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="text-white/70">{req.name}</span>
                            {req.courses_needed && (
                              <p className="text-white/40 text-xs truncate">
                                Take: {req.courses_needed.slice(0, 2).join(' or ')}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                      {selectedTarget.major_requirements.missing.length > 5 && (
                        <p className="text-white/40 text-xs pl-5">
                          +{selectedTarget.major_requirements.missing.length - 5} more
                        </p>
                      )}
                    </div>
                  </div>
                )}
                
                {!selectedTarget.major_requirements?.completed?.length && 
                 !selectedTarget.major_requirements?.missing?.length && (
                  <p className="text-white/40 text-sm">No specific requirements analyzed</p>
                )}
              </div>

              {/* Risks & Recommendations - Enhanced */}
              <div className="bg-white/5 rounded-xl p-4">
                <h5 className="text-white font-medium mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Issues & Recommendations
                </h5>
                
                {selectedTarget.risks?.length > 0 ? (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                    {selectedTarget.risks.map((risk, i) => (
                      <div 
                        key={i} 
                        className="p-3 bg-gradient-to-r from-amber-500/10 to-transparent rounded-lg border-l-2 border-amber-500"
                      >
                        <p className="text-amber-300 text-sm font-semibold mb-1">{risk.type}</p>
                        <p className="text-white/70 text-sm leading-relaxed">{risk.message}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-500/10 rounded-lg border-l-2 border-emerald-500">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <p className="text-emerald-300 text-sm">
                        No major issues identified! You're on track. 🎉
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* GE Progress Grid */}
      <div className="glass rounded-2xl p-4">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Award className="w-5 h-5 text-ucsc-gold" />
          {gePattern === 'cal-getc' ? 'Cal-GETC' : 'IGETC'} Progress
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {ge_status && Object.entries(ge_status).map(([area, info]) => (
            <div
              key={area}
              className={`p-3 rounded-xl text-center transition-all hover:scale-105 cursor-pointer ${
                info.completed 
                  ? 'bg-emerald-500/20 border border-emerald-500/30' 
                  : 'bg-red-500/20 border border-red-500/30'
              }`}
            >
              <p className={`text-lg font-bold ${info.completed ? 'text-emerald-400' : 'text-red-400'}`}>
                {area}
              </p>
              <p className="text-white/50 text-xs truncate">{info.name}</p>
              {info.completed && info.satisfied_by && (
                <p className="text-emerald-300/70 text-xs mt-1 truncate font-mono">
                  {info.satisfied_by}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Quick Stats Footer */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between text-sm flex-wrap gap-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2 text-white/60">
              <Clock className="w-4 h-4" />
              <span>Pattern: <span className="text-ucsc-gold">{gePattern === 'cal-getc' ? 'Cal-GETC' : 'IGETC'}</span></span>
            </div>
            <div className="flex items-center gap-2 text-white/60">
              <Calendar className="w-4 h-4" />
              <span>College: <span className="text-white">{userData.communityCollege || 'N/A'}</span></span>
            </div>
          </div>
          <div className="text-white/40">
            {calculatedStats.courseCount} courses analyzed
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;